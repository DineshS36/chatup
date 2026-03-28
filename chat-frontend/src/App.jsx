import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Chat from "./pages/Chat";
import Status from "./pages/Status";
import CommunityDashboard from "./pages/community/CommunityDashboard";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/status" element={<Status />} />
        <Route path="/community" element={<CommunityDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;