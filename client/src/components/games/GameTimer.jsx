// Shrinking time bar shown at the top of a game screen.
// duration + elapsed in seconds.
function GameTimer({ duration, elapsed }) {
  const remaining = Math.max(0, 1 - elapsed / duration);
  return (
    <div className="w-full h-1.5 rounded-full bg-dark-700 overflow-hidden">
      <div
        className="h-full rounded-full transition-[width] duration-200 ease-linear"
        style={{ width: `${remaining * 100}%`, backgroundColor: '#185FA5' }}
      />
    </div>
  );
}

export default GameTimer;
