import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

function PageHeader({ backTo, onBack, title, children }) {
  const backClass = 'p-1 -ml-1 text-slt hover:text-ink transition-colors';
  return (
    <header className="bg-dark-900 border-b border-dark-600 px-page py-4 sticky top-0 z-10">
      <div className="max-w-lg mx-auto flex items-center gap-2">
        {backTo && (
          <Link to={backTo} className={backClass}>
            <ChevronLeft size={20} />
          </Link>
        )}
        {!backTo && onBack && (
          <button type="button" onClick={onBack} className={backClass}>
            <ChevronLeft size={20} />
          </button>
        )}
        <p className="text-heading font-bold text-ink flex-1">{title}</p>
        {children}
      </div>
    </header>
  );
}

export default PageHeader;
