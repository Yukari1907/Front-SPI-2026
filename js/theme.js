"use strict";

(function applySavedTheme(){
    const theme = localStorage.getItem("visaoepi_theme") || "light";
    document.documentElement.setAttribute("data-theme", theme);
})();

window.applyTheme = function(theme){
    const normalized = theme === "dark" ? "dark" : "light";
    localStorage.setItem("visaoepi_theme", normalized);
    document.documentElement.setAttribute("data-theme", normalized);
    window.dispatchEvent(new CustomEvent("visaoepi:themechange", { detail: { theme: normalized } }));
};