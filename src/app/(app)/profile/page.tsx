import { requireAuth } from "@/lib/auth";
import { loadProfile } from "@/lib/profile";
import ProfileForm from "@/components/ProfileForm";
import ChangePasswordCard from "@/components/ChangePasswordCard";

export default async function AccountPage() {
  const [{ username }, profile] = await Promise.all([requireAuth(), loadProfile()]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Mon compte</h1>
          <p className="muted">
            Connecté en tant que <strong>{username}</strong>.
          </p>
        </div>
      </div>
      <ProfileForm initial={profile} username={username} />
      <ChangePasswordCard />
    </>
  );
}
