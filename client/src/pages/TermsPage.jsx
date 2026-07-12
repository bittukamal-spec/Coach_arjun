import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function Section({ title, children, id }) {
  return (
    <div id={id} className="mb-10 scroll-mt-24">
      <h2 className="text-xl font-bold text-ink mb-4">{title}</h2>
      <div className="text-slt leading-relaxed space-y-3">{children}</div>
    </div>
  );
}

function TermsPage() {
  const navigate = useNavigate();

  // Scroll to a section anchor (e.g. /terms#ai-child-safety) on load or when
  // navigated to directly — SPA route changes don't trigger the browser's
  // native hash-scroll behavior on their own.
  useEffect(() => {
    if (!window.location.hash) return;
    const el = document.getElementById(window.location.hash.slice(1));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div className="min-h-screen bg-dark-900 text-ink">
      <header className="max-w-3xl mx-auto px-4 sm:px-6 py-5 flex items-center gap-4">
        <button onClick={() => navigate('/')} className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <span className="font-bold text-ink text-lg">Arjun</span>
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 pb-20">
        <div className="mb-10">
          <h1 className="text-4xl font-extrabold text-ink mb-3">Terms of Service</h1>
          <p className="text-slt text-sm">Last updated: 19 June 2026</p>
        </div>

        <div className="bg-dark-800 border border-red-500/30 rounded-2xl px-5 py-4 mb-10">
          <p className="text-red-700 text-sm font-semibold mb-1">⚠️ Important — read this first</p>
          <p className="text-slt text-sm">Arjun is a <strong className="text-ink">mental performance coaching tool for athletes</strong>. It is <strong className="text-ink">not</strong> a medical service, therapy, counselling, or a substitute for professional mental health care. If you are experiencing a mental health crisis, please contact a qualified professional or a crisis helpline.</p>
        </div>

        <Section title="1. Acceptance of terms">
          <p>By creating an account or using Arjun at coacharjun.in, you agree to these Terms of Service and our <button onClick={() => navigate('/privacy')} className="text-brand-400 hover:text-brand-700 underline underline-offset-2">Privacy Policy</button>. If you do not agree, please do not use the service.</p>
        </Section>

        <Section title="2. What Arjun is — and is not">
          <p>Arjun provides <strong className="text-ink">AI-powered mental performance coaching</strong> to help athletes manage focus, confidence, and pressure related to sport.</p>
          <p>Arjun is <strong className="text-ink">NOT</strong>:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>A licensed therapist, psychologist, or medical professional</li>
            <li>A crisis intervention service</li>
            <li>A substitute for professional mental health treatment</li>
            <li>A diagnostic tool for any mental health condition</li>
          </ul>
          <p>The AI coach named "Arjun" is a software system. It does not have human judgment and its responses should not be treated as professional advice.</p>
        </Section>

        <Section id="ai-child-safety" title="3. AI and Child Safety">
          <p>Arjun is an <strong className="text-ink">AI mental-performance coaching product</strong>. It is <strong className="text-ink">not</strong> a human coach, doctor, therapist, or emergency service, and it cannot diagnose or treat any condition. Arjun is intended for sport-performance support — focus, confidence, pressure, and routines — not diagnosis or treatment of mental or physical health conditions.</p>
          <p>Athletes aged <strong className="text-ink">13–17</strong> require verified parent/guardian consent before they can use Arjun's protected AI coaching features. See <button onClick={() => navigate('/privacy')} className="text-brand-400 hover:text-brand-700 underline underline-offset-2">Section 8 (Minors)</button> of our Privacy Policy for how this works.</p>
          <p>Certain messages — for example ones describing distress, self-harm, or safety concerns — may trigger a safety guidance message with helpline and support contacts (see Section 9 below). This is automated pattern-based guidance, not a monitored or professionally reviewed crisis service, and it is <strong className="text-ink">not</strong> continuously monitored by a person. Do not assume a human is reading every message or that a guardian will automatically be contacted.</p>
          <p>If you or someone you know is in immediate danger, <strong className="text-ink">contact a trusted adult or emergency services directly</strong> — do not rely on Arjun for emergencies.</p>
          <p>Arjun does not use advertising or behavioural tracking for any user, including minors — see our <button onClick={() => navigate('/privacy')} className="text-brand-400 hover:text-brand-700 underline underline-offset-2">Privacy Policy</button> for details. Athletes and guardians can request account and data deletion at any time from Settings → Account → Delete Account, or by contacting us — see Section 5 (Your account) and our Privacy Policy for how deletion works.</p>
        </Section>

        <Section title="4. Eligibility">
          <p>You must be at least <strong className="text-ink">13 years old</strong> to use Arjun. If you are 13–17, guardian consent is required before you can use Arjun's coaching tools (see Section 3 above).</p>
          <p>By creating an account, you confirm that the information you provide (name, email, sport details) is accurate.</p>
        </Section>

        <Section title="5. Your account">
          <p>You are responsible for keeping your account credentials secure. Do not share your password. Notify us immediately at <a href="mailto:kamal.prabhanshu@outlook.com" className="text-brand-400 hover:text-brand-700 underline underline-offset-2">kamal.prabhanshu@outlook.com</a> if you believe your account has been compromised.</p>
          <p>One person, one account. You may not create accounts on behalf of others or use automated systems to access Arjun.</p>
        </Section>

        <Section title="6. Free trial and subscription">
          <p><strong className="text-ink">Free trial:</strong> New accounts receive 14 days of full access to Arjun coaching at no cost. No credit card is required to start.</p>
          <p><strong className="text-ink">Premium subscription:</strong> After the trial, continued access to AI coaching requires a paid subscription (₹299/month or ₹1999/year). Check-ins and progress tracking remain free forever.</p>
          <p><strong className="text-ink">Billing:</strong> Subscription billing details will be provided when payment features are activated. You will be notified before any charge.</p>
          <p><strong className="text-ink">Refunds:</strong> We offer a 7-day refund on monthly subscriptions if you are unsatisfied. Contact <a href="mailto:kamal.prabhanshu@outlook.com" className="text-brand-400 hover:text-brand-700 underline underline-offset-2">kamal.prabhanshu@outlook.com</a>. See our full <button onClick={() => navigate('/refund')} className="text-brand-400 hover:text-brand-700 underline underline-offset-2">Refund &amp; Cancellation Policy</button>.</p>
        </Section>

        <Section title="7. Acceptable use">
          <p>You agree not to:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Use Arjun to harm yourself or others</li>
            <li>Attempt to manipulate or abuse the AI system</li>
            <li>Use the service for any illegal purpose</li>
            <li>Share, resell, or commercially exploit content generated by Arjun</li>
            <li>Attempt to reverse-engineer, scrape, or extract the system's prompts or logic</li>
          </ul>
        </Section>

        <Section title="8. Mental health and crisis situations">
          <p>If at any point you are experiencing thoughts of self-harm, suicide, or a mental health emergency, <strong className="text-ink">please stop using this app and contact a professional immediately</strong>.</p>
          <p>India crisis resources:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong className="text-ink">iCall:</strong> <a href="tel:9152987821" className="text-brand-400 hover:text-brand-700">9152987821</a></li>
            <li><strong className="text-ink">Vandrevala Foundation:</strong> 1860-2662-345 (24/7)</li>
            <li><strong className="text-ink">NIMHANS:</strong> 080-46110007</li>
          </ul>
          <p>Arjun is a <strong className="text-ink">mental performance tool, not a medical or crisis service</strong>. It is not equipped to handle crisis situations and is not a substitute for emergency care.</p>
        </Section>

        <Section title="9. Intellectual property">
          <p>The Arjun brand, name, visual design, and software code are owned by Prabhanshu Kamal. You may not copy, reproduce, or use our branding without written permission.</p>
          <p>Content you create (your check-ins, reflections, goals) belongs to you. You can export or delete it at any time.</p>
        </Section>

        <Section title="10. Disclaimer of warranties">
          <p>Arjun is provided "as is." We make no guarantee that the service will:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Improve your athletic performance</li>
            <li>Be available without interruption</li>
            <li>Be free of errors or inaccuracies in AI responses</li>
          </ul>
          <p>AI responses are generated automatically and may occasionally be inaccurate, incomplete, or not suitable for your specific situation. Use your own judgment.</p>
        </Section>

        <Section title="11. Limitation of liability">
          <p>To the maximum extent permitted by law, we are not liable for any indirect, incidental, or consequential damages arising from your use of Arjun — including decisions made based on AI coaching responses.</p>
          <p>Our total liability to you shall not exceed the amount you paid us in the 3 months prior to the claim.</p>
        </Section>

        <Section title="12. Termination">
          <p>You may delete your account at any time from Settings → Account → Delete Account. All your data will be permanently removed.</p>
          <p>We may suspend or terminate accounts that violate these terms, with notice where possible.</p>
        </Section>

        <Section title="13. Changes to these terms">
          <p>We may update these terms. If we make significant changes, we will notify you by email at least 7 days before they take effect. Continued use after that date means you accept the new terms.</p>
        </Section>

        <Section title="14. Governing law">
          <p>These terms are governed by the laws of India. Any disputes shall be subject to the jurisdiction of courts in India.</p>
        </Section>

        <Section title="15. Contact">
          <p><strong className="text-ink">Prabhanshu Kamal</strong><br />
          Email: <a href="mailto:kamal.prabhanshu@outlook.com" className="text-brand-400 hover:text-brand-700 underline underline-offset-2">kamal.prabhanshu@outlook.com</a></p>
        </Section>
      </main>

      <footer className="border-t border-dark-700 py-6">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <span className="text-xs text-slt00">© {new Date().getFullYear()} Arjun</span>
          <div className="flex gap-4">
            <button onClick={() => navigate('/privacy')} className="text-xs text-slt hover:text-ink">Privacy</button>
            <button onClick={() => navigate('/refund')} className="text-xs text-slt hover:text-ink">Refund</button>
            <button onClick={() => navigate('/')} className="text-xs text-slt hover:text-ink">Home</button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default TermsPage;
