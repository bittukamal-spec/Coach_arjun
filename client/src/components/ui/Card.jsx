const VARIANTS = {
  // Ordinary cards and list rows stay visually flat.
  flat: 'bg-dark-800 border border-dark-600 rounded-2xl',
  // The one restrained Arjun signature gradient — use at most once per screen.
  hero: 'card-hero text-white',
};

function Card({ as: Tag = 'div', variant = 'flat', className = '', ...props }) {
  return <Tag className={`${VARIANTS[variant]} ${className}`} {...props} />;
}

export default Card;
