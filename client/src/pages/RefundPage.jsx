import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function Section({ title, children }) {
  return (
    <div className="mb-10">
      <h2 className="text-xl font-bold text-ink mb-4">{title}</h2>
      <div className="text-slt leading-relaxed space-y-3">{children}</div>
    </div>
  );
}

function RefundPage() {
  const navigate = useNavigate();
  const { language } = useAuth();
  const hi = language === 'hi';

  if (hi) {
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
            <h1 className="text-4xl font-extrabold text-ink mb-3">रिफंड और रद्दीकरण नीति</h1>
            <p className="text-slt text-sm">अंतिम अपडेट: 19 जून 2026</p>
          </div>

          <Section title="1. हमारी योजनाएं">
            <p><strong className="text-ink">14-दिन का मुफ़्त ट्रायल:</strong> नए खाते को पूरे 14 दिनों का पूर्ण Arjun कोचिंग एक्सेस मिलता है — बिना किसी क्रेडिट कार्ड के।</p>
            <p><strong className="text-ink">मासिक प्रीमियम:</strong> ₹299/माह — हर 30 दिनों में स्वचालित रूप से नवीनीकृत होता है।</p>
            <p><strong className="text-ink">वार्षिक प्रीमियम:</strong> ₹1999/वर्ष — एक बार बिल होता है, मासिक की तुलना में 44% की बचत।</p>
          </Section>

          <Section title="2. बिलिंग कैसे काम करती है">
            <p>एक बार सदस्यता लेने के बाद, आपकी योजना अगले बिलिंग तिथि पर स्वचालित रूप से नवीनीकृत होती है जब तक आप रद्द नहीं करते।</p>
            <p>आप किसी भी समय रद्द कर सकते हैं — खाता → सदस्यता → रद्द करें। रद्दीकरण आपके मौजूदा बिलिंग अवधि के अंत में प्रभावी होता है। आप तब तक पूर्ण पहुंच का उपयोग जारी रख सकते हैं।</p>
          </Section>

          <Section title="3. रिफंड नीति">
            <p>हम <strong className="text-ink">14-दिन का पूर्ण निःशुल्क ट्रायल</strong> प्रदान करते हैं — कोई क्रेडिट कार्ड नहीं, कोई प्रतिबद्धता नहीं — ताकि आप सदस्यता लेने से पहले Arjun को पूरी तरह से आज़मा सकें।</p>
            <p>इस कारण से, एक बार भुगतान होने के बाद हम <strong className="text-ink">आम तौर पर रिफंड नहीं</strong> देते।</p>
            <p>अपवाद: अगर आपको लगता है कि आपसे गलती से शुल्क लिया गया है, तो कृपया भुगतान के 7 दिनों के भीतर हमसे संपर्क करें — हम प्रत्येक मामले को व्यक्तिगत रूप से देखेंगे।</p>
          </Section>

          <Section title="4. रद्द कैसे करें">
            <p>ऐप में: <strong className="text-ink">खाता → सदस्यता → प्लान रद्द करें</strong></p>
            <p>ईमेल द्वारा: <a href="mailto:kamal.prabhanshu@outlook.com" className="text-brand-400 hover:text-brand-700 underline underline-offset-2">kamal.prabhanshu@outlook.com</a> पर लिखें — हम 2 कार्यदिवसों के भीतर जवाब देंगे।</p>
          </Section>

          <Section title="5. संपर्क करें">
            <p><strong className="text-ink">Prabhanshu Kamal</strong><br />
            ईमेल: <a href="mailto:kamal.prabhanshu@outlook.com" className="text-brand-400 hover:text-brand-700 underline underline-offset-2">kamal.prabhanshu@outlook.com</a></p>
            <p className="text-sm">हम सभी बिलिंग प्रश्नों और चिंताओं का जवाब 2 कार्यदिवसों के भीतर देने की कोशिश करते हैं।</p>
          </Section>

          <Section title="6. मानसिक स्वास्थ्य और संकट स्थितियां">
            <p>Arjun एक <strong className="text-ink">मानसिक प्रदर्शन उपकरण</strong> है — कोई चिकित्सा सेवा, थेरेपी, या संकट हस्तक्षेप सेवा नहीं। अगर आप आत्म-नुकसान या मानसिक स्वास्थ्य आपातकाल के बारे में सोच रहे हैं, तो कृपया तुरंत एक पेशेवर से संपर्क करें।</p>
            <p>भारत संकट संसाधन:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong className="text-ink">iCall:</strong> <a href="tel:9152987821" className="text-brand-400 hover:text-brand-700">9152987821</a></li>
              <li><strong className="text-ink">Vandrevala Foundation:</strong> 1860-2662-345 (24/7)</li>
              <li><strong className="text-ink">NIMHANS:</strong> 080-46110007</li>
            </ul>
          </Section>
        </main>

        <footer className="border-t border-dark-700 py-6">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 flex items-center justify-between">
            <span className="text-xs text-slt00">© {new Date().getFullYear()} Arjun</span>
            <div className="flex gap-4">
              <button onClick={() => navigate('/terms')} className="text-xs text-slt hover:text-ink">Terms</button>
              <button onClick={() => navigate('/privacy')} className="text-xs text-slt hover:text-ink">Privacy</button>
              <button onClick={() => navigate('/')} className="text-xs text-slt hover:text-ink">Home</button>
            </div>
          </div>
        </footer>
      </div>
    );
  }

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
          <h1 className="text-4xl font-extrabold text-ink mb-3">Refund &amp; Cancellation Policy</h1>
          <p className="text-slt text-sm">Last updated: 19 June 2026</p>
        </div>

        <Section title="1. Our plans">
          <p><strong className="text-ink">14-day free trial:</strong> New accounts receive full Arjun coaching access for 14 days at no cost — no credit card required.</p>
          <p><strong className="text-ink">Monthly premium:</strong> ₹299/month — renews automatically every 30 days.</p>
          <p><strong className="text-ink">Annual premium:</strong> ₹1999/year — billed once per year, saving 44% vs monthly.</p>
        </Section>

        <Section title="2. How billing works">
          <p>Once subscribed, your plan auto-renews on your next billing date until you cancel.</p>
          <p>You can cancel any time — go to Account → Subscription → Cancel Plan. Cancellation takes effect at the end of your current billing period. You keep full access until then.</p>
        </Section>

        <Section title="3. Refund policy">
          <p>We offer a <strong className="text-ink">14-day fully unlimited free trial</strong> — no credit card, no commitment — so you can experience Arjun fully before subscribing.</p>
          <p>Because of this, once payment has been made, we <strong className="text-ink">generally do not offer refunds</strong>.</p>
          <p>Exception: if you believe you were charged in error, contact us within 7 days of the charge and we will review your case individually.</p>
        </Section>

        <Section title="4. How to cancel">
          <p>In the app: <strong className="text-ink">Account → Subscription → Cancel Plan</strong></p>
          <p>By email: write to <a href="mailto:kamal.prabhanshu@outlook.com" className="text-brand-400 hover:text-brand-700 underline underline-offset-2">kamal.prabhanshu@outlook.com</a> and we will process your cancellation within 2 business days.</p>
        </Section>

        <Section title="5. Contact">
          <p><strong className="text-ink">Prabhanshu Kamal</strong><br />
          Email: <a href="mailto:kamal.prabhanshu@outlook.com" className="text-brand-400 hover:text-brand-700 underline underline-offset-2">kamal.prabhanshu@outlook.com</a></p>
          <p className="text-sm">We aim to respond to all billing questions and concerns within 2 business days.</p>
        </Section>

        <Section title="6. Mental health and crisis situations">
          <p>Arjun is a <strong className="text-ink">mental performance tool</strong> — not a medical service, therapy, or crisis intervention service. If you are experiencing thoughts of self-harm or a mental health emergency, please contact a professional immediately.</p>
          <p>India crisis resources:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong className="text-ink">iCall:</strong> <a href="tel:9152987821" className="text-brand-400 hover:text-brand-700">9152987821</a></li>
            <li><strong className="text-ink">Vandrevala Foundation:</strong> 1860-2662-345 (24/7)</li>
            <li><strong className="text-ink">NIMHANS:</strong> 080-46110007</li>
          </ul>
        </Section>
      </main>

      <footer className="border-t border-dark-700 py-6">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <span className="text-xs text-slt00">© {new Date().getFullYear()} Arjun</span>
          <div className="flex gap-4">
            <button onClick={() => navigate('/terms')} className="text-xs text-slt hover:text-ink">Terms</button>
            <button onClick={() => navigate('/privacy')} className="text-xs text-slt hover:text-ink">Privacy</button>
            <button onClick={() => navigate('/')} className="text-xs text-slt hover:text-ink">Home</button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default RefundPage;
