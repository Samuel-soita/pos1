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

    interface STKRequest {
      businessId: string;
      phone: string;
      amount: number | string;
      saleId?: string;
    }

    const { businessId, phone, amount, saleId } = await req.json() as STKRequest;

    if (!businessId || !phone || !amount) {
      throw new Error("Missing required fields: businessId, phone, amount");
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

    console.log(`[STK Push] Formatted Phone: ${formattedPhone} from original: ${phone}`);

    // 1. Fetch Business Specific Configuration (Hub Status & Fees)
    const { data: config, error: configError } = await supabaseClient
      .from("business_mpesa_configs")
      .select("*")
      .eq("business_id", businessId)
      .single();

    if (configError || !config || !config.is_enabled) {
      throw new Error("M-Pesa automated checkout is not enabled for this business.");
    }

    const convenience_fee = config.convenience_fee || 0;

    // 2. STK Push using Samuel's Universal Credentials
    const consumerKey = Deno.env.get("MPESA_CONSUMER_KEY");
    const consumerSecret = Deno.env.get("MPESA_CONSUMER_SECRET");
    const shortCode = Deno.env.get("MPESA_SHORTCODE") || "174379";
    const passkey = Deno.env.get("MPESA_PASSKEY");
    const callbackUrl = Deno.env.get("MPESA_CALLBACK_URL");

    if (!consumerKey || !consumerSecret || !passkey) {
      throw new Error("Universal M-Pesa keys are not configured in system secrets.");
    }

    const mpesaEnv = Deno.env.get("MPESA_ENVIRONMENT") || "sandbox"; // 'sandbox' or 'api'
    const baseUrl = `https://${mpesaEnv}.safaricom.co.ke`;

    // 3. Generate Universal Daraja Access Token
    const auth = btoa(`${consumerKey}:${consumerSecret}`);
    const tokenResp = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${auth}` }
    });
    const { access_token } = await tokenResp.json();

    if (!access_token) throw new Error("Could not generate universal access token.");

    // 4. Calculate Final Amount (Amount + Convenience Fee)
    const finalAmount = Math.round(Number(amount) + Number(convenience_fee));

    // 5. Prepare Universal STK Push
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const password = btoa(`${shortCode}${passkey}${timestamp}`);

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
      // AccountReference must be max 12 chars
      AccountReference: `SALE-${(saleId || businessId).slice(0, 7)}`,
      TransactionDesc: "POS-Sale"
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

    // 6. Record Pending Payment Request for routing
    const { error: dbError } = await supabaseClient
      .from("payment_requests")
      .insert({
        id: crypto.randomUUID(),
        business_id: businessId,
        sale_id: saleId || null,
        checkout_request_id: stkData.CheckoutRequestID,
        phone_number: formattedPhone,
        amount: Number(amount) || 0,
        mpesa_fee: Number(convenience_fee) || 0,
        payment_type: "sale",
        status: "pending",
        timestamp: Date.now()
      });

    if (dbError) {
      console.error("Database Insert Error:", JSON.stringify(dbError));
      throw new Error(`Database error: ${dbError.message}`);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      checkoutRequestId: stkData.CheckoutRequestID,
      finalAmount: finalAmount,
      fee: convenience_fee
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    const stack = error instanceof Error ? error.stack : "";
    console.error(`[STK Push Error] ${message}`, stack);
    return new Response(JSON.stringify({ 
      error: message,
      success: false,
      stack: stack 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400, 
    });
  }
});
