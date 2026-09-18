"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/client";

/**
 * Enterprise lead form (cycle 10). Posts to /api/enterprise-lead, which
 * records the lead in the admin pipeline (Enterprise leads section) and
 * queues a notification to sales@docurama.eu in the mail outbox — nothing is
 * lost even while SMTP delivery is not wired.
 */

const SEAT_OPTIONS = ["1-10", "11-50", "51-100", "100+"];
const VOLUME_OPTIONS = [
  { value: "250", label: "Up to 250 / month" },
  { value: "1000", label: "250 - 1,000 / month" },
  { value: "5000", label: "1,000 - 5,000 / month" },
  { value: "10000", label: "More than 5,000 / month" },
];

export function EnterpriseLeadForm() {
  const [form, setForm] = useState({
    company: "",
    contactName: "",
    email: "",
    phone: "",
    seats: SEAT_OPTIONS[1],
    monthlyEnvelopes: VOLUME_OPTIONS[1].value,
    requirements: "",
  });
  const [done, setDone] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      fetch("/api/enterprise-lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      }).then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        if (!res.ok) throw new ApiError(body.error ?? `Request failed (HTTP ${res.status})`, res.status);
        return body;
      }),
    onSuccess: (body) => {
      setDone(true);
      toast.success(body.message ?? "Request received — we'll reply within one business day");
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  if (done) {
    return (
      <div className="mt-8 rounded-xl border border-primary/40 bg-primary-soft/40 p-6">
        <p className="flex items-center gap-2 text-sm font-semibold text-primary-deep">
          <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden /> Request received
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Thank you, {form.contactName.split(" ")[0] || "there"} — your request
          is in the Enterprise pipeline (reference: the email you provided). A
          solutions engineer replies within one business day. Meanwhile, the{" "}
          <a className="font-medium underline underline-offset-2" href="/docs">documentation</a> and{" "}
          <a className="font-medium underline underline-offset-2" href="/security">security pages</a>{" "}
          answer most procurement questions.
        </p>
      </div>
    );
  }

  const valid = form.company.trim() && form.contactName.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email);

  return (
    <form
      className="mt-8 space-y-5 rounded-xl border bg-card p-6"
      onSubmit={(e) => { e.preventDefault(); if (valid) submit.mutate(); }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="el-company">Company *</Label>
          <Input id="el-company" required maxLength={120} value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Acme Industries SA" className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="el-contact">Your name *</Label>
          <Input id="el-contact" required maxLength={80} value={form.contactName}
            onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="Camille Martin" className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="el-email">Work email *</Label>
          <Input id="el-email" required type="email" maxLength={120} value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="camille@acme.eu" className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="el-phone">Phone (optional)</Label>
          <Input id="el-phone" maxLength={40} value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+33 6 12 34 56 78" className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="el-seats">Expected seats</Label>
          <select id="el-seats" value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })}
            className="h-11 w-full rounded-lg border bg-background px-3 text-sm">
            {SEAT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="el-volume">Monthly envelope volume</Label>
          <select id="el-volume" value={form.monthlyEnvelopes} onChange={(e) => setForm({ ...form, monthlyEnvelopes: e.target.value })}
            className="h-11 w-full rounded-lg border bg-background px-3 text-sm">
            {VOLUME_OPTIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="el-req">What do you need? (SSO, Part 11, self-hosting, small team structures…)</Label>
        <Textarea id="el-req" rows={4} maxLength={2000} value={form.requirements}
          onChange={(e) => setForm({ ...form, requirements: e.target.value })}
          placeholder="We're a medical-device company, 40 seats, need Part 11 mode and our own certificates; possible self-hosting later." />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!valid || submit.isPending}>
          {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          Send to the Enterprise team
        </Button>
        <p className="text-xs text-muted-foreground">
          We reply within one business day. Your details are used only for this request (GDPR Art. 5, data minimisation).
        </p>
      </div>
    </form>
  );
}
