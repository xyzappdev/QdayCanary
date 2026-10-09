export function Cage() {
  return (
    <svg className="cage" viewBox="0 0 240 296" role="img" aria-label="A canary in a cage">
      <circle className="stroke" cx="120" cy="20" r="9" />
      <path className="stroke" d="M30 122 A90 90 0 0 1 210 122 V268 H30 Z" />
      <path className="stroke" d="M60 55 V268 M90 37 V268 M120 30 V268 M150 37 V268 M180 55 V268" />
      <rect className="solid" x="20" y="266" width="200" height="12" />
      <path className="stroke" d="M58 216 H182" />
      <g className="bird">
        <polygon className="solid" points="94,186 56,168 62,198" />
        <ellipse className="solid" cx="118" cy="182" rx="31" ry="24" />
        <circle className="solid" cx="146" cy="156" r="17" />
        <polygon className="solid" points="160,150 178,157 160,164" />
        <path className="cutline" d="M100 180 Q114 196 130 182" />
        <circle className="cut eye-dot" cx="150" cy="152" r="3" />
        <path className="cutline eye-x" d="M146 148 L154 156 M154 148 L146 156" />
        <path className="stroke" d="M111 204 V215 M126 204 V215" />
      </g>
    </svg>
  );
}
