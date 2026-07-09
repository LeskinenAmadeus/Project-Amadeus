type InputBarProps = {
  input: string;
  loading: boolean;
  brainOnline: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
};

function InputBar({
  input,
  loading,
  brainOnline,
  onInputChange,
  onSend,
  onStop,
}: InputBarProps) {
  return (
    <form
      className="input-row"
      onSubmit={(e) => {
        e.preventDefault();
        loading ? onStop() : onSend();
      }}
    >
      <input
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        placeholder={
          brainOnline
            ? "Send message to Amadeus..."
            : "Start Ollama to enable Amadeus..."
        }
        disabled={loading || !brainOnline}
      />

      <button
        type="button"
        onClick={loading ? onStop : onSend}
        disabled={!loading && (!input.trim() || !brainOnline)}
      >
        {loading ? "Stop" : "Transmit"}
      </button>
    </form>
  );
}

export default InputBar;