
document.addEventListener("DOMContentLoaded", async () => {
    if (!await window.sessionReady) return;
    const profile=getProfile();
    const form=document.getElementById("profileForm");

    Object.entries(profile).forEach(([key,value])=>{
        if(form.elements[key])form.elements[key].value=value??"";
    });

    document.getElementById("profileAvatar").textContent=initials(profile.name);
    document.getElementById("profileNameDisplay").textContent=profile.name;
    document.getElementById("profileEmailDisplay").textContent=profile.email;
    document.getElementById("profileRoleDisplay").textContent=profile.role;

    Array.from(form.elements).forEach(field => { field.disabled = true; });
    document.getElementById("saveProfile").disabled = true;
    document.getElementById("saveProfile").title = "Edição de perfil indisponível";
});
