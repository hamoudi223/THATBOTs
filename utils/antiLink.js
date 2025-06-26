export const detectLink = (text) => {
  const linkRegex = /(https?:\/\/[^\s]+)/gi;
  return linkRegex.test(text);
};
