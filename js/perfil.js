
document.addEventListener("DOMContentLoaded",()=>{
    const profile=getProfile();
    const form=document.getElementById("profileForm");

    Object.entries(profile).forEach(([key,value])=>{
        if(form.elements[key])form.elements[key].value=value??"";
    });

    document.getElementById("profileAvatar").textContent=initials(profile.name);
    document.getElementById("profileNameDisplay").textContent=profile.name;
    document.getElementById("profileEmailDisplay").textContent=profile.email;
    document.getElementById("profileRoleDisplay").textContent=profile.role;

    document.getElementById("saveProfile").addEventListener("click",()=>{
        const updated={
            ...profile,
            ...Object.fromEntries(new FormData(form))
        };

        localStorage.setItem("visaoepi_profile",JSON.stringify(updated));
        showToast("Perfil atualizado.");

        setTimeout(()=>window.location.reload(),300);
    });
});
