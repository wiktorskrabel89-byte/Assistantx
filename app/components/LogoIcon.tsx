type LogoIconProps = {
  className?: string;
  /** Use transparent background when placing the icon on a colored surface */
  transparent?: boolean;
};

export function LogoIcon({ className = "h-8 w-8", transparent = false }: LogoIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className={className}>
      {!transparent && <rect width="32" height="32" rx="6" fill="#dc2626" />}
      {transparent && <rect width="32" height="32" rx="6" fill="white" fillOpacity="0.2" />}
      <line x1="8" y1="8" x2="24" y2="24" stroke="white" strokeWidth="4.5" strokeLinecap="round" />
      <line x1="24" y1="8" x2="8" y2="24" stroke="white" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}
