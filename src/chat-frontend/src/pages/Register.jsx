import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import API from "../services/api";

function Register() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            await API.post("/auth/register", { name, email, password });
            navigate("/");
        } catch (err) {
            setError(
                err.response?.data?.message || "Registration failed. Please try again."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={styles.wrapper}>
            <div style={styles.card}>
                <div style={styles.header}>
                    <h1 style={styles.logo}>💬 ChatUp</h1>
                    <p style={styles.subtitle}>Create your account</p>
                </div>

                {error && <div style={styles.error}>{error}</div>}

                <form onSubmit={handleSubmit} style={styles.form}>
                    <div style={styles.inputGroup}>
                        <label style={styles.label}>Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Your full name"
                            required
                            style={styles.input}
                        />
                    </div>

                    <div style={styles.inputGroup}>
                        <label style={styles.label}>Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                            style={styles.input}
                        />
                    </div>

                    <div style={styles.inputGroup}>
                        <label style={styles.label}>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="At least 6 characters"
                            required
                            minLength={6}
                            style={styles.input}
                        />
                    </div>

                    <button type="submit" disabled={loading} style={styles.button}>
                        {loading ? "Creating account..." : "Register"}
                    </button>
                </form>

                <p style={styles.footer}>
                    Already have an account?{" "}
                    <Link to="/" style={styles.link}>
                        Login
                    </Link>
                </p>
            </div>
        </div>
    );
}

const styles = {
    wrapper: {
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        padding: "20px",
    },
    card: {
        background: "rgba(255, 255, 255, 0.05)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "20px",
        padding: "48px 40px",
        width: "100%",
        maxWidth: "420px",
        boxShadow: "0 25px 50px rgba(0, 0, 0, 0.4)",
    },
    header: {
        textAlign: "center",
        marginBottom: "32px",
    },
    logo: {
        fontSize: "32px",
        fontWeight: "700",
        color: "#fff",
        margin: "0 0 8px 0",
    },
    subtitle: {
        color: "rgba(255, 255, 255, 0.5)",
        fontSize: "14px",
        margin: 0,
    },
    error: {
        background: "rgba(239, 68, 68, 0.15)",
        border: "1px solid rgba(239, 68, 68, 0.3)",
        color: "#fca5a5",
        padding: "12px 16px",
        borderRadius: "10px",
        fontSize: "13px",
        marginBottom: "20px",
        textAlign: "center",
    },
    form: {
        display: "flex",
        flexDirection: "column",
        gap: "20px",
    },
    inputGroup: {
        display: "flex",
        flexDirection: "column",
        gap: "6px",
    },
    label: {
        color: "rgba(255, 255, 255, 0.7)",
        fontSize: "13px",
        fontWeight: "500",
    },
    input: {
        background: "rgba(255, 255, 255, 0.07)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: "10px",
        padding: "14px 16px",
        fontSize: "15px",
        color: "#fff",
        outline: "none",
        transition: "border-color 0.2s",
    },
    button: {
        background: "linear-gradient(135deg, #667eea, #764ba2)",
        color: "#fff",
        border: "none",
        borderRadius: "10px",
        padding: "14px",
        fontSize: "15px",
        fontWeight: "600",
        cursor: "pointer",
        marginTop: "8px",
        transition: "opacity 0.2s",
    },
    footer: {
        textAlign: "center",
        color: "rgba(255, 255, 255, 0.5)",
        fontSize: "13px",
        marginTop: "24px",
    },
    link: {
        color: "#818cf8",
        textDecoration: "none",
        fontWeight: "600",
    },
};

export default Register;
