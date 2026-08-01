// `primary` matches the approved recipe (also `.btn-primary` in index.css):
// min-height 54px, flat brand/primary fill, visible focus ring.
const VARIANTS = {
  primary: 'min-h-[54px] bg-brand-500 text-white hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
  outline: 'border border-brand-600/40 text-brand-500 hover:bg-brand-600/10',
  ghost: 'text-slt hover:text-ink hover:bg-dark-400',
};

function Button({ variant = 'primary', className = '', ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-[14px] px-6 py-3 text-body font-semibold transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export default Button;
