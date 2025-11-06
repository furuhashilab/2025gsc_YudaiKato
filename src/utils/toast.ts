export function toast(msg: string) {
  const el = document.createElement("div");
  el.textContent = msg;
  Object.assign(el.style, {
    position: "fixed",
    bottom: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(0,0,0,.85)",
    color: "#fff",
    padding: "10px 14px",
    borderRadius: "8px",
    zIndex: "9999",
    fontSize: "14px",
    maxWidth: "85vw",
    textAlign: "center",
  });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}
