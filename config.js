// Mesmo projeto Supabase do Gestão de Sacas (mesma empresa, mesmo
// ponto de retirada) — as tabelas novas usam prefixo "pa_" e não
// tocam nas tabelas do Sacas. Ver sql/schema.sql.
//
// authDomain é o MESMO domínio que o gestao-sacas/app.js usa (AUTH_DOMAIN
// = "gestaosacas.local") — de propósito: como é o mesmo projeto Supabase,
// isso faz um login que já existe no Sacas funcionar aqui também, bastando
// liberar o acesso em pa_usuarios (sem criar conta nova).
window.PACOTES_AVULSOS_CONFIG = {
  supabaseUrl: "https://ksorakxlpibgunsjxeev.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtzb3Jha3hscGliZ3Vuc2p4ZWV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwOTAyNzcsImV4cCI6MjEwNDY2NjI3N30.6dWxPJV0r9dIEztCYi0dZ0l47l0h83hY15qZG6NacY4",
  authDomain: "@gestaosacas.local",
  gestaoSacasUrl: "https://sacas-ten.vercel.app/"
};
