
document.addEventListener("DOMContentLoaded",()=>{
    const confidence=document.getElementById("confidence");
    const confidenceValue=document.getElementById("confidenceValue");
    const themeSelect=document.getElementById("themeSelect");

    confidence.addEventListener("input",()=>{
        confidenceValue.textContent=confidence.value+"%";
    });

    themeSelect.value=localStorage.getItem("visaoepi_theme")||"light";

    themeSelect.addEventListener("change",()=>{
        applyTheme(themeSelect.value);
    });

    document.getElementById("saveSettings").addEventListener("click",()=>{
        applyTheme(themeSelect.value);
        showToast("Configurações salvas.");
    });
});
