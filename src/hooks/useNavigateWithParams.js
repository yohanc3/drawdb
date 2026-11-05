import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

export default function useNavigateWithParams() {
  const navigate = useNavigate();

  return useCallback(
    (to, options = {}) => {
      const { clearSearch, ...navigateOptions } = options;
      navigate(to + (clearSearch || to.includes("?") ? "" : window.location.search), navigateOptions);
    },
    [navigate],
  );
}
