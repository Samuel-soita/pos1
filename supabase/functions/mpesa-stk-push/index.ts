import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    interface ActivationRequest {
      businessId: string;
      phone: string;
      targetPackage?: string;
      paymentType?: string;
    }

    const { businessId, phone, targetPackage, paymentType } = await req.json() as ActivationRequest;

    if (!businessId || !phone) {
      throw new Error("Missing required fields: businessId, phone");
    }

    if (typeof phone !== "string") {
      throw new Error("Phone must be a valid string");
    }

    // Phone Number Hardening (Ensure 2547XXXXXXXX or 2541XXXXXXXX)
    let formattedPhone = phone.replace(/\D/g, ""); 
    if (formattedPhone.startsWith("0")) {
      formattedPhone = "254" + formattedPhone.slice(1);
    } 
    
    // Final check: if it's 9 digits (7XXXXXXXX), prepend 254
    if (formattedPhone.length === 9) {
      formattedPhone = "254" + formattedPhone;
    }

    if (formattedPhone.length !== 12 || !formattedPhone.startsWith("254")) {
      throw new Error(`Invalid phone format: ${phone}. Must be a valid Safaricom number (e.g., 0712345678)`);
    }

    console.log(`[Activation Push] Formatted Phone: ${formattedPhone} from original: ${phone}`);

    // -- SERVER-SIDE ENFORCEMENT OF BILLING --
    const { data: business, error: bizError } = await supabaseClient
      .from('businesses')
      .select('package_id, enabled_features, custom_feature_count')
      .eq('id', businessId)
      .single();

    if (bizError || !business) throw new Error("Business not found for billing.");

    const { count: staffCount } = await supabaseClient
      .from('staff')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('status', 'active');

    const packages: Record<string, number> = {
      hustler: 600,
      growth: 1500,
      max: 3500,
      custom: 0
    };

    const activeStaff = staffCount || 0;
    const staffCost = activeStaff * 150;

    // Modular & Custom Costs
    const MODULAR_PRICES: Record<string, number> = {
      inventory_alerts: 200,
      branch_management: 500,
      shift_tracking: 300,
      advanced_analytics: 600,
      excel_exports: 400,
      receipt_customization: 200
    };
    
    const enabledFeatures = business.enabled_features || [];
    const modularCost = enabledFeatures.reduce((acc: number, feat: string) => {
      return acc + (MODULAR_PRICES[feat] || 0);
    }, 0);
    
    const customPrice = (business.custom_feature_count || 0) * 200;
    const extraCosts = staffCost + modularCost + customPrice;

    const selectedPackage = targetPackage || business.package_id || 'hustler';
    const basePrice = packages[selectedPackage] || 600;

    let calculatedAmount = basePrice + extraCosts;

    if (targetPackage && targetPackage !== business.package_id) {
        const currentPrice = packages[business.package_id] || 600;
        let diff = basePrice - currentPrice;
        if (diff < 0) diff = 0; // if downgrade, don't refund, charge full new cycle OR just the extras
        // For simplicity, if they upgrade just charge difference + extra costs for the new cycle
        calculatedAmount = diff + extraCosts; 
        if (calculatedAmount <= 0) calculatedAmount = basePrice + extraCosts;
    }

    if (calculatedAmount <= 0) throw new Error("Calculated amount is invalid.");

    // 1. Get Daraja Credentials from Environment
    const consumerKey = Deno.env.get("MPESA_CONSUMER_KEY");
    const consumerSecret = Deno.env.get("MPESA_CONSUMER_SECRET");
    const shortCode = Deno.env.get("MPESA_SHORTCODE") || "174379";
    const passkey = Deno.env.get("MPESA_PASSKEY");
    const callbackUrl = Deno.env.get("MPESA_CALLBACK_URL");

    if (!consumerKey || !consumerSecret || !passkey) {
      throw new Error("M-Pesa credentials not configured in Supabase Secrets");
    }

    const mpesaEnv = Deno.env.get("MPESA_ENVIRONMENT") || "sandbox"; // 'sandbox' or 'api'
    const baseUrl = `https://${mpesaEnv}.safaricom.co.ke`;

    // 2. Generate Access Token
    const auth = btoa(`${consumerKey}:${consumerSecret}`);
    const tokenResp = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${auth}` }
    });
    const { access_token } = await tokenResp.json();

    if (!access_token) throw new Error("Could not generate M-Pesa access token. Check your credentials.");

    // 3. Prepare STK Push
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const password = btoa(`${shortCode}${passkey}${timestamp}`);

    const PLATFORM_FEE = 10;
    const finalAmount = Math.round(calculatedAmount + PLATFORM_FEE);

    const stkBody = {
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(finalAmount),
      PartyA: formattedPhone,
      PartyB: shortCode,
      PhoneNumber: formattedPhone,
      CallBackURL: callbackUrl,
      AccountReference: `ACT-${businessId.slice(0, 8)}`,
      TransactionDesc: "POS-Activation"
    };

    const stkResp = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(stkBody)
    });

    const stkData = await stkResp.json();

    if (stkData.ResponseCode !== "0") {
      console.error("M-Pesa STK Push Error:", JSON.stringify(stkData));
      throw new Error(`M-Pesa STK Push failed: ${stkData.errorMessage || stkData.CustomerMessage || stkData.ResponseDescription || 'Unknown Error'}`);
    }

    // 4. Record the Pending Payment Request
    const { error: dbError } = await supabaseClient
      .from("payment_requests")
      .insert({
        id: crypto.randomUUID(),
        business_id: businessId,
        checkout_request_id: stkData.CheckoutRequestID,
        phone_number: formattedPhone,
        amount: calculatedAmount,
        payment_type: paymentType || "activation",
        target_package: targetPackage,
        status: "pending",
        timestamp: Date.now()
      });

    if (dbError) throw dbError;

    return new Response(JSON.stringify({ 
      success: true, 
      checkoutRequestId: stkData.CheckoutRequestID 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    console.error(`[STK Push Error] ${message}`);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
