import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";

import ListingsPage from "./pages/ListingsPage";
import EditListingPage from "./pages/EditListingPage";
import PosPage from "./pages/PosPage";
import CalculatorPage from "./pages/CalculatorPage";
import NotFound from "./pages/NotFound";

export function AppRouter() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<ListingsPage />} />
        <Route path="/edit/:d" element={<EditListingPage />} />
        <Route path="/pos" element={<PosPage />} />
        <Route path="/calculator" element={<CalculatorPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRouter;
