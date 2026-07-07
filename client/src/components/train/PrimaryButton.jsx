// Blue → purple gradient CTA, shared by Train cards and tool-intro screens.
function PrimaryButton({ children, onClick, size = 'md', className = '', disabled = false }) {
  const sizing = size === 'lg' ? 'py-4 text-base' : 'py-2.5 px-5 text-sm';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`btn-gradient w-full ${sizing} ${className}`}
      style={size === 'lg' ? { minHeight: '56px' } : { minHeight: '44px' }}
    >
      {children}
    </button>
  );
}

export default PrimaryButton;
