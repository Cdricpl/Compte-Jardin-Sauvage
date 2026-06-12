// Empêche l'ouverture d'une console noire en arrière-plan sous Windows (release uniquement)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    edd_compta_lib::run()
}
