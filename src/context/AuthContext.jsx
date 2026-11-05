import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Button, Input, Modal, Toast } from "@douyinfe/semi-ui";
import ExtensionsContext from "./ExtensionsContext";
import {
  authLogin, authLogout, authMe, authSignup,
  cloudDelete, cloudList, cloudLoad, cloudSave, cloudShare,
} from "../api/cloud";

const AuthContext = createContext({ user: null, ready: false, openAuth: () => {} });
export const useAuth = () => useContext(AuthContext);

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    authMe().then(({ user }) => setUser(user)).catch(() => {}).finally(() => setReady(true));
  }, []);

  const openAuth = useCallback((nextMode = "login") => {
    setMode(nextMode);
    setError("");
    setAuthOpen(true);
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = mode === "signup"
        ? await authSignup(email, password)
        : await authLogin(email, password);
      setUser(result.user);
      setAuthOpen(false);
      setPassword("");
      Toast.success(mode === "signup" ? "Account created" : "Signed in");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    try {
      await authLogout();
      setUser(null);
      window.location.assign("/");
    } catch (err) {
      Toast.error(err.message);
    }
  };

  const extensionValue = useMemo(() => ({
    cloudLoad,
    cloudShare,
    ...(user ? {
      cloudSave,
      cloudList,
      cloudDelete,
      cloudCurrentUserId: user.id,
    } : {}),
  }), [user]);

  const contextValue = useMemo(() => ({ user, ready, openAuth, logout }), [user, ready, openAuth]);

  return (
    <AuthContext.Provider value={contextValue}>
      <ExtensionsContext.Provider value={extensionValue}>{children}</ExtensionsContext.Provider>
      <Modal
        title={mode === "signup" ? "Create a free account" : "Sign in"}
        visible={authOpen}
        onCancel={() => setAuthOpen(false)}
        footer={null}
        centered
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">Email
            <Input type="email" value={email} onChange={setEmail} required autoComplete="email" />
          </label>
          <label className="flex flex-col gap-1">Password
            <Input type="password" value={password} onChange={setPassword} required minLength={mode === "signup" ? 10 : undefined} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
          </label>
          {error && <p className="text-red-600 text-sm" role="alert">{error}</p>}
          <Button htmlType="submit" theme="solid" loading={busy} block>
            {mode === "signup" ? "Create account" : "Sign in"}
          </Button>
          <Button type="tertiary" theme="borderless" onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(""); }}>
            {mode === "signup" ? "Already have an account? Sign in" : "New here? Create a free account"}
          </Button>
          <p className="text-xs text-zinc-500">Without an account, diagrams stay in this browser.</p>
        </form>
      </Modal>
    </AuthContext.Provider>
  );
}
