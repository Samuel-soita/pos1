import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    console.log("M-Pesa Callback Received:", JSON.stringify(body));

    const stkCallback = body.Body.stkCallback;
    const checkoutRequestId = stkCallback.CheckoutRequestID;
    const resultCode = stkCallback.ResultCode;

    if (!checkoutRequestId) {
      throw new Error("Missing CheckoutRequestID in callback payload");
    }

    // 1. Audit Log: Save raw callback
    await supabaseClient
      .from("mpesa_raw_callbacks")
      .insert({
        checkout_request_id: checkoutRequestId,
        payload: body
      });

    // 2. Identify the Status
    // ResultCode 0 = Success, others are typically cancellations or failures
    const status = resultCode === 0 ? "success" : "failed";
    
    // Parse M-Pesa Receipt Number if success
    let mpesaCode = null;
    if (resultCode === 0 && stkCallback.CallbackMetadata && Array.isArray(stkCallback.CallbackMetadata.Item)) {
      const items = stkCallback.CallbackMetadata.Item;
      const receiptItem = items.find((i: { Name: string, Value?: string }) => i.Name === "MpesaReceiptNumber");
      mpesaCode = receiptItem?.Value || null;
    }

    // 3. Update the Payment Request
    const { error: updateError } = await supabaseClient
      .from("payment_requests")
      .update({
        status: status,
        mpesa_code: mpesaCode,
        timestamp: Date.now() 
      })
      .eq("checkout_request_id", checkoutRequestId);

    if (updateError) throw updateError;

    // Side effect: The database trigger 'on_payment_success' will now 
    // automatically activate the business if the status became 'success'.

    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    console.error(`[Callback Error] ${message}`);
    // Always return 0 to Safaricom if we reached the function, to avoid retries
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted with logic error" }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  }
});
