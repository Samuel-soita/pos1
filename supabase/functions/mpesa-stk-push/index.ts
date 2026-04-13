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
      amount: number | string;
      paymentType?: string;
    }

    const { businessId, phone, amount, paymentType } = await req.json() as ActivationRequest;

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

    console.log(`[Activation Push] Formatted Phone: ${formattedPhone} from original: ${phone}`);

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
    const finalAmount = Math.round(Number(amount) + PLATFORM_FEE);

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
        amount: Number(amount) || 0,
        payment_type: paymentType || "activation",
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
