type StatusStripProps = {
  loading: boolean;
  brainOnline: boolean;
};

function StatusStrip({ loading, brainOnline }: StatusStripProps) {
  return (
    <section className="status-strip">
      <span>Brain: {loading ? "Thinking" : brainOnline ? "Online" : "Offline"}</span>
      <span>Memory: Offline</span>
      <span>Voice: Offline</span>
      <span>Live2D: Active</span>
      <span>Model: {brainOnline ? "amadeus-kurisu" : "Unavailable"}</span>
    </section>
  );
}

export default StatusStrip;