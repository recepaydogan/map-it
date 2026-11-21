/** Keep explicit acquisition instructions verbatim; item effects describe other rewards. */
export const getItemAcquisitionNotes = (description?: string): string[] => {
  const sentences = description?.split(/\r?\n|(?<=\.)\s+(?=[A-Z])/) ?? [];
  return [...new Set(sentences.map((sentence) => sentence.trim()).filter((sentence) =>
    /^(?:(?:it|this item)\s+)?(?:(?:can|may) be\s+|is\s+)?(?:obtained|acquired|purchased|bought)\s+(?:by|from|through|via|in|at|while|after|for)\b/i.test(sentence),
  ))];
};
