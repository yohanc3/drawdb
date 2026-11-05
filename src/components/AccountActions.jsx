import { Button } from "@douyinfe/semi-ui";
import { useAuth } from "../context/AuthContext";

export default function AccountActions() {
  const { user, ready, openAuth, logout } = useAuth();
  if (!ready) return null;
  if (!user) return (
    <Button type="tertiary" theme="borderless" className="!rounded-lg !font-medium" onClick={() => openAuth("login")}>Sign in / Sign up</Button>
  );
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs max-w-36 truncate" title={user.email}>{user.email}</span>
      <Button type="tertiary" theme="borderless" className="!rounded-lg" onClick={logout}>Sign out</Button>
    </div>
  );
}
