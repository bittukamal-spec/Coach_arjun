import { useNavigate } from 'react-router-dom';

function Section({ title, children }) {
  return (
    <div className="mb-10">
      <h2 className="text-xl font-bold text-white mb-4">{title}</h2>
      <div className="text-slate-400 leading-relaxed space-y-3">{children}</div>
    </div>
  );
}

function TermsPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-dark-900 text-white">
      <header className="max-w-3xl mx-auto px-4 sm:px-6 py-5 flex items-center gap-4">
        <button onClick={() => navigate('/')} className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <span className="font-bold text-white text-lg">Arjun</span>
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 pb-20">
        <div className="mb-10">
          <h1 className="text-4xl font-extrabold text-white mb-3">Terms of Service</h1>
          <p className="text-slate-500 text-sm">Last updated: 19 June 2026</p>
        </div>

        <div className="bg-dark-800 border border-red-500/30 rounded-2xl px-5 py-4 mb-10">
          <p className="text-red-300 text-sm font-semibold mb-1">⚠️ Important — read this first</p>
          <p className="text-slate-400 text-sm">Arjun is a <strong className="text-white">mental performance coaching tool for athletes</strong>. It is <strong className="text-white">not</strong> a medical service, therapy, counselling, or a substitute for professional mental health care. If you are experiencing a mental health crisis, please contact a qualified professional or a crisis helpline.</p>
        </div>

        <Section title="1. Acceptance of terms">
          <p>By creating an account or using Arjun at coacharjun.in, you agree to these Terms of Service and our <button onClick={() => navigate('/privacy')} className="text-brand-400 hover:text-brand-300 underline underline-offset-2">Privacy Policy</button>. If you do not agree, please do not use the service.</p>
        </Section>

        <Section title="2. What Arjun is — and is not">
          <p>Arjun provides <strong className="text-white">AI-powered mental performance coaching</strong> to help athletes manage focus, confidence, and pressure related to sport.</p>
          <p>Arjun is <strong className="text-white">NOT</strong>:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>A licensed therapist, psychologist, or medical professional</li>
            <li>A crisis intervention service</li>
            <li>A substitute for professional mental health treatment</li>
            <li>A diagnostic tool for any mental health condition</li>
          </ul>
          <p>The AI coach named "Arjun" is a software system. It does not have human judgment and its responses should not be treated as professional advice.</p>
        </Section>

        <Section title="3. Eligibility">
          <p>You must be at least <strong className="text-white">13 years old</strong> to use Arjun. If you are under 18, you should have parental awareness before using this service.</p>
          <p>By creating an account, you confirm that the information you provide (name, email, sport details) is accurate.</p>
        </Section>

        <Section title="4. Your account">
          <p>You are responsible for keeping your account credentials secure. Do not share your password. Notify us immediately at kamal.prabhanshu@outlook.com if you believe your account has been compromised.</p>
          <p>One person, one account. You may not create accounts on behalf of others or use automated systems to access Arjun.</p>
        </Section>

        <Section title="5. Free trial and subscription">
          <p><strong className="text-white">Free trial:</strong> New accounts receive 14 days of full access to Arjun coaching at no cost. No credit card is required to start.</p>
          <p><strong className="text-white">Premium subscription:</strong> After the trial, continued access to AI coaching requires a paid subscription (₹299/month or ₹1999/year). Check-ins and progress tracking remain free forever.</p>
          <p><strong className="text-white">Billing:</strong> Subscription billing details will be provided when payment features are activated. You will be notified before any charge.</p>
          <p><strong className="text-white">Refunds:</strong> We offer a 7-day refund on monthly subscriptions if you are unsatisfied. Contact kamal.prabhanshu@outlook.com.</p>
        </Section>

        <Section title="6. Acceptable use">
          <p>You agree not to:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Use Arjun to harm yourself or others</li>
            <li>Attempt to manipulate or abuse the AI system</li>
            <li>Use the service for any illegal purpose</li>
            <li>Share, resell, or commercially exploit content generated by Arjun</li>
            <li>Attempt to reverse-engineer, scrape, or extract the system's prompts or logic</li>
          </ul>
        </Section>

        <Section title="7. Mental health and crisis situations">
          <p>If at any point you are experiencing thoughts of self-harm, suicide, or a mental health emergency, <strong className="text-white">please stop using this app and contact a professional immediately</strong>.</p>
          <p>India crisis resources:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong className="text-white">iCall:</strong> 9152987821</li>
            <li><strong className="text-white">Vandrevala Foundation:</strong> 1860-2662-345 (24/7)</li>
            <li><strong className="text-white">NIMHANS:</strong> 080-46110007</li>
          </ul>
          <p>Arjun is not equipped to handle crisis situations and is not a substitute for emergency care.</p>
        </Section>

        <Section title="8. Intellectual property">
          <p>The Arjun brand, name, visual design, and software code are owned by Prabhanshu Kamal. You may not copy, reproduce, or use our branding without written permission.</p>
          <p>Content you create (your check-ins, reflections, goals) belongs to you. You can export or delete it at any time.</p>
        </Section>

        <Section title="9. Disclaimer of warranties">
          <p>Arjun is provided "as is." We make no guarantee that the service will:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Improve your athletic performance</li>
            <li>Be available without interruption</li>
            <li>Be free of errors or inaccuracies in AI responses</li>
          </ul>
          <p>AI responses are generated automatically and may occasionally be inaccurate, incomplete, or not suitable for your specific situation. Use your own judgment.</p>
        </Section>

        <Section title="10. Limitation of liability">
          <p>To the maximum extent permitted by law, we are not liable for any indirect, incidental, or consequential damages arising from your use of Arjun — including decisions made based on AI coaching responses.</p>
          <p>Our total liability to you shall not exceed the amount you paid us in the 3 months prior to the claim.</p>
        </Section>

        <Section title="11. Termination">
          <p>You may delete your account at any time from Settings → Account → Delete Account. All your data will be permanently removed.</p>
          <p>We may suspend or terminate accounts that violate these terms, with notice where possible.</p>
        </Section>

        <Section title="12. Changes to these terms">
          <p>We may update these terms. If we make significant changes, we will notify you by email at least 7 days before they take effect. Continued use after that date means you accept the new terms.</p>
        </Section>

        <Section title="13. Governing law">
          <p>These terms are governed by the laws of India. Any disputes shall be subject to the jurisdiction of courts in India.</p>
        </Section>

        <Section title="14. Contact">
          <p><strong className="text-white">Prabhanshu Kamal</strong><br />
          Email: <strong className="text-white">kamal.prabhanshu@outlook.com</strong></p>
        </Section>
      </main>

      <footer className="border-t border-dark-700 py-6">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <span className="text-xs text-slate-600">© {new Date().getFullYear()} Arjun</span>
          <div className="flex gap-4">
            <button onClick={() => navigate('/privacy')} className="text-xs text-slate-500 hover:text-slate-300">Privacy</button>
            <button onClick={() => navigate('/')} className="text-xs text-slate-500 hover:text-slate-300">Home</button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default TermsPage;
