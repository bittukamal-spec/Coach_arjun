export default function BreathingCircle({ phase, count, status, countdownNum, phaseLabel }) {
  const circleScale = status === 'running' && phase ? phase.scale : 1.0;
  const transitionDuration = status === 'running' && phase ? phase.duration : 0.6;
  const glowIntensity = status === 'running' ? 50 : 20;
  const glowOpacity  = status === 'running' ? 0.45 : 0.2;

  return (
    <div className="relative flex items-center justify-center">
      <div
        className="absolute rounded-full bg-brand-500/10"
        style={{
          width: '280px', height: '280px',
          transform: `scale(${circleScale * 0.95})`,
          transition: `transform ${transitionDuration}s ease-in-out`,
        }}
      />
      <div
        className="w-52 h-52 rounded-full bg-brand-500 flex flex-col items-center justify-center relative z-10"
        style={{
          transform: `scale(${circleScale})`,
          transition: `transform ${transitionDuration}s ease-in-out`,
          boxShadow: `0 0 ${glowIntensity}px rgba(11,110,79,${glowOpacity})`,
        }}
      >
        {status === 'countdown' ? (
          <span className="text-5xl font-bold text-white leading-none">{countdownNum}</span>
        ) : (
          <>
            <span className="text-5xl font-bold text-white leading-none">{count}</span>
            {phaseLabel && (
              <span className="text-sm font-medium text-white mt-1">{phaseLabel}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
