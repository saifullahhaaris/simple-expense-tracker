import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const login = mode === "login";

  if (!loading && user) return <Navigate to="/dashboard" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(login ? "Logging in..." : "Creating account...");
    try {
      if (login) {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) throw new Error("Login failed.");
        navigate("/dashboard", { replace: true });
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (data.session) {
          setMessage("Account created successfully.");
          setTimeout(() => navigate("/dashboard", { replace: true }), 800);
        } else {
          setMessage("Account created. Please check your email to confirm your account.");
        }
      }
    } catch (error) {
      setMessage((error as Error).message || (login ? "Invalid email or password." : "Could not create account."));
    } finally { setBusy(false); }
  };

  return (
    <section className="auth-section">
      <div className="auth-card">
        <h1>Expense Tracker</h1>
        <p className="auth-subtitle">{login ? "Sign in to manage your expenses." : "Create an account to start tracking."}</p>
        <form onSubmit={submit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input type="email" id="email" placeholder="Email address" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input type="password" id="password" placeholder={login ? "Password" : "Create a password"} required
              autoComplete={login ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <br />
          <button type="submit" className="btn-primary" disabled={busy}>{login ? "Login" : "Sign Up"}</button>
        </form>
        <p className="auth-message" role="status">{message}</p>
        <Link to={login ? "/signup" : "/login"} className="auth-toggle">
          {login ? "Don't have an account? Sign up" : "Already have an account? Login"}
        </Link>
      </div>
    </section>
  );
}

export const Login = () => <AuthForm mode="login" />;
export const Signup = () => <AuthForm mode="signup" />;
