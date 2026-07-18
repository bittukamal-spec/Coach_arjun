const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  outline: 'border border-brand-600/40 text-brand-500 hover:bg-brand-600/10',
  ghost: 'text-slt hover:text-ink hover:bg-dark-400',
};

function Button({ variant = 'primary', className = '', ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3 text-body font-semibold transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export default Button;
