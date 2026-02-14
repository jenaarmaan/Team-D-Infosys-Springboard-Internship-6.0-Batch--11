import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useGmail } from "@/contexts/GmailContext";

export default function GmailOAuth() {
  const gmail = useGmail();
  const navigate = useNavigate();

  useEffect(() => {
    gmail.handleOAuthCallback();
    navigate("/gmail");
  }, []);

  return <div>Authenticating Gmail…</div>;
}

// export default function GmailOAuth() {
//   const gmail = useGmail();
//   const navigate = useNavigate();

//   useEffect(() => {
//     // 1️⃣ Capture OAuth token from URL
//     gmail.handleOAuthCallback();

//     // 2️⃣ Fetch inbox using OAuth token
//     gmail.fetchInboxViaOAuth();

//     // 3️⃣ Redirect to Gmail UI
//     navigate("/gmail");
//   }, []);

//   return <div>Authenticating Gmail…</div>;
// }
