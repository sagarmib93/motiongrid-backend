import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  company: z.string().optional(),
  // Honeypot – keep hidden on the UI
  website: z.string().optional(),
});

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = process.env.CONTACT_FROM!; // e.g. 'Contact Form <hello@yourdomain.com>'
const TO = process.env.CONTACT_TO!; // e.g. 'leads@yourdomain.com'
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN; // e.g. 'https://yourdomain.com'

function cors(res: VercelResponse) {
  if (ALLOWED_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*"); // tighten in prod
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function escapeHtml(str: string) {
  return str.replace(
    /[&<>"']/g,
    (s) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[s] as string,
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const { name, email, phone, company, website } = parsed.data;

    // Honeypot: if present, pretend success
    if (website) return res.status(200).json({ ok: true });

    await resend.emails.send({
      from: FROM,
      to: TO.split(",").map((s) => s.trim()),
      replyTo: email,
      subject: `New website inquiry from ${name}`,
      html: `
        <h2>New Inquiry</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        ${phone ? `<p><strong>Phone:</strong> ${escapeHtml(phone)}</p>` : ""}
        ${company ? `<p><strong>Company:</strong> ${escapeHtml(company)}</p>` : ""}
      `,
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to send email" });
  }
}
