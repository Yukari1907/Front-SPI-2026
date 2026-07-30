
"use strict";

(function applySavedTheme(){
    const theme=localStorage.getItem("visaoepi_theme")||"light";
    document.documentElement.dataset.theme=theme==="dark"?"dark":"";
})();

window.applyTheme=function(theme){
    const normalized=theme==="dark"?"dark":"light";
    localStorage.setItem("visaoepi_theme",normalized);
    document.documentElement.dataset.theme=normalized==="dark"?"dark":"";
    window.dispatchEvent(new CustomEvent("visaoepi:themechange",{detail:{theme:normalized}}));
};
