# CleanNet Camions – planning en ligne

Pages : `/` = espace client pro (par code) · `/#/admin` = ton espace admin.

## Mise en route
1. **Supabase** : SQL Editor → coller tout `supabase.sql` → Run.
2. **Supabase** : Authentication → Users → Add user (ton e-mail + mot de passe). Puis Authentication → Sign In / Providers → désactiver « Allow new users to sign up ».
3. **Supabase** : Project Settings → API → noter l'URL et la clé `anon`.
4. **GitHub** : nouveau dépôt, envoyer le contenu du zip.
5. **Vercel** : importer le dépôt, ajouter les variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`, Deploy.
6. Va sur `ton-site/#/admin` : crée un client (un code est généré), ajoute ses camions, ajoute des demi-journées disponibles (matin ou après-midi). Donne le code au client.
