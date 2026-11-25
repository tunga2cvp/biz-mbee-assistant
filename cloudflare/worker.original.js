/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run "npm run dev" in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run "npm run deploy" to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/*/

 export default {
  async fetch(request, env) {
    if (
      !env.POC_TOKEN ||
      request.headers.get("Authorization") !== `Bearer ${env.POC_TOKEN}`
    ) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (request.method !== "POST") {
      return new Response("Use POST", { status: 405 });
    }

    let body;
    try {
      const text = await request.text();
      if (text.length > 8000) {
        return new Response("Request too large", { status: 413 });
      }
      body = JSON.parse(text);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    if (
      typeof body?.message !== "string" ||
      !body.message.trim() ||
      body.message.length > 1000
    ) {
      return new Response("message must contain 1–1000 characters", {
        status: 400,
      });
    }

    try {
      const result = await env.AI.run("@cf/qwen/qwen3.8-27b", {
        messages: [
          {
            role: "system",
            content:
              "Bạn là trợ lý thử nghiệm giao diện ngân hàng doanh nghiệp. " +
              "Trả lời ngắn gọn bằng ngôn ngữ người dùng. " +
              "Không yêu cầu mật khẩu, OTP hoặc dữ liệu khách hàng. " +
              "Không tự nhận đã thực hiện giao dịch. " +
              "Nếu chưa có hướng dẫn nghiệp vụ được cung cấp, hãy nói rõ, không bịa.",
          },
          { role: "user", content: body.message },
        ],
        reasoning_effort: "low",
        max_completion_tokens: 1024,
      });

      return Response.json(result, {
        headers: { "Cache-Control": "no-store",
          "Content-Type":"application/json; charset=utf-8"
         },

      });
    } catch {
      return Response.json(
        { error: "AI request failed; check Worker logs and quota." },
        { status: 502 },
      );
    }
  },
};