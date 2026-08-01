import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { translations } from '../../i18n/translations';

function PageHeader({ backTo, onBack, title, children }) {
  const { language } = useAuth();
  // Icon-only control: without this the screen reader announces only "button".
  const backLabel = (translations[language] || translations.en).common.back;
  // 44×44 minimum tap target; the negative margin keeps the chevron optically
  // aligned to the page gutter despite the larger hit area.
  const backClass =
    'w-11 h-11 -ml-3 flex items-center justify-center shrink-0 rounded-full text-slt hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';
  return (
    <header className="bg-dark-900 border-b border-dark-600 px-page py-4 sticky top-0 z-10">
      <div className="max-w-lg mx-auto flex items-center gap-2">
        {backTo && (
          <Link to={backTo} aria-label={backLabel} className={backClass}>
            <ChevronLeft size={20} aria-hidden="true" />
          </Link>
        )}
        {!backTo && onBack && (
          <button type="button" onClick={onBack} aria-label={backLabel} className={backClass}>
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
        )}
        <p className="text-heading font-bold text-ink flex-1">{title}</p>
        {children}
      </div>
    </header>
  );
}

export default PageHeader;
