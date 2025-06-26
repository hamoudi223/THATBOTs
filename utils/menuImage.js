export const getMenuBuffer = async () => {
  const res = await fetch("https://files.catbox.moe/tr8qs8.jpg");
  return Buffer.from(await res.arrayBuffer());
};
