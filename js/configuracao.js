document.addEventListener("DOMContentLoaded", async () => {
    if (!await window.sessionReady) return;
    const themeSelect=document.getElementById("themeSelect");
    themeSelect.value=localStorage.getItem("visaoepi_theme")||"light";

    themeSelect.addEventListener("change",()=>{
        applyTheme(themeSelect.value);
    });

    document.getElementById("saveSettings").addEventListener("click",()=>{
        applyTheme(themeSelect.value);
        showToast("Tema salvo neste navegador.");
    });
});
