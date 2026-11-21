const ForeverLabel = ({ text }: { text: string }) => {
  const index = text.indexOf("Forever");
  if (index < 0) return <span className="text-zinc-200">{text}</span>;

  return <span className="text-zinc-200">{text.slice(0, index)}<span className="text-forever-blue">Forever</span>{text.slice(index + "Forever".length)}</span>;
};

export default ForeverLabel;
