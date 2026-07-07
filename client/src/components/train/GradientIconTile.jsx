// Rounded-square icon tile with a diagonal gradient fill — reserved for a
// screen's single "hero" moment (Train's top-priority tool card, a tool
// intro's hero icon). Everyday tool icons use the flat .icon-tile instead;
// mixing the two is what keeps the gradient feeling special rather than
// applied everywhere.
export const GRADIENT_VARIANTS = {
  teal:   { from: '#2E7D6B', to: '#22D3C5' },   // calm / reset / recovery
  blue:   { from: '#185FA5', to: '#8B5CF6' },   // focus / mental skills
  amber:  { from: '#D97F1E', to: '#F5A62E' },   // reflection / after-training
  purple: { from: '#6366F1', to: '#8B5CF6' },   // visualization / imagery
};

function GradientIconTile({ icon: Icon, variant = 'blue', size = 22, className = '' }) {
  const VARIANTS = GRADIENT_VARIANTS;
  const { from, to } = VARIANTS[variant] || VARIANTS.blue;
  return (
    <div className={`icon-tile-gradient ${className}`} style={{ '--grad-from': from, '--grad-to': to }}>
      <Icon size={size} />
    </div>
  );
}

export default GradientIconTile;
