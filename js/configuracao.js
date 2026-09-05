
// Preferência de notificação por e-mail — persistida só localmente por
// enquanto. O backend ainda não expõe um endpoint pra isso (ver
// CONTRATO_INTEGRACAO.md: "item em aberto, não assumir que existe").
// Quando o endpoint existir, trocar load/save abaixo por chamadas de API.
const NOTIFY_EMAIL_PREFS_KEY="visaoepi_notify_email_prefs";

function loadNotifyEmailPrefs(){
    try{
        return JSON.parse(localStorage.getItem(NOTIFY_EMAIL_PREFS_KEY)||"null")||{enabled:true,email:""};
    }catch{
        return {enabled:true,email:""};
    }
}

function saveNotifyEmailPrefs(prefs){
    localStorage.setItem(NOTIFY_EMAIL_PREFS_KEY,JSON.stringify(prefs));
}

document.addEventListener("DOMContentLoaded",()=>{
    const confidence=document.getElementById("confidence");
    const confidenceValue=document.getElementById("confidenceValue");
    const themeSelect=document.getElementById("themeSelect");
    const notifyEmailCheckbox=document.getElementById("notifyEmailCheckbox");
    const supervisorEmailInput=document.getElementById("supervisorEmailInput");

    confidence.addEventListener("input",()=>{
        confidenceValue.textContent=confidence.value+"%";
    });

    themeSelect.value=localStorage.getItem("visaoepi_theme")||"light";

    themeSelect.addEventListener("change",()=>{
        applyTheme(themeSelect.value);
    });

    const notifyPrefs=loadNotifyEmailPrefs();
    if(notifyEmailCheckbox) notifyEmailCheckbox.checked=notifyPrefs.enabled;
    if(supervisorEmailInput) supervisorEmailInput.value=notifyPrefs.email;

    document.getElementById("saveSettings").addEventListener("click",()=>{
        applyTheme(themeSelect.value);

        saveNotifyEmailPrefs({
            enabled:notifyEmailCheckbox?.checked??true,
            email:supervisorEmailInput?.value||""
        });

        showToast("Configurações salvas.");
    });
});
