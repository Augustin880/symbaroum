# Le Veilleur

Compagnon de table local et installable pour Symbaroum : plusieurs personnages, fiche, inventaire, combat, talents, journal de dés et calculateur de probabilités.

## Lancer l’application

```bash
cd veilleur-de-davokar
npm start
```

Ouvrir ensuite `http://localhost:4173`. Les données sont conservées dans le stockage local du navigateur. Sur tablette, utiliser « Ajouter à l’écran d’accueil » pour l’installer comme une application.

## Calculs

- Formules acceptées : `1d10`, `2d6+1`, `3d4-1`, etc.
- La protection adverse est retirée du total sans permettre de dégâts négatifs.
- Un test de caractéristique réussit avec un résultat au d20 inférieur ou égal à la caractéristique modifiée.
- Les dégâts espérés combinent la chance de toucher et les dégâts moyens après protection.
- Les armes et les armures du personnage possèdent chacune leur dé et leur bonus propre.
- Dans le calculateur offensif, l’ennemi possède une protection fixe : `max(0, dégâts − protection)`.
- Une formule optionnelle peut s’appliquer en cas d’échec du test (`1d6` pour Cascade de soufre) ; laissée vide, l’échec inflige zéro dégât.
- Les jets physiques et virtuels alimentent le même journal et les mêmes statistiques.
- Un sort peut décrire des effets sans dégâts et posséder des dés différents en cas de réussite ou d’échec.
- Un talent peut modifier jusqu’à trois caractéristiques et définir deux substitutions conditionnelles (par exemple Vigilance à la place de Précision avec une arme à distance).
- Les graphiques se filtrent simultanément et indépendamment par formule de dé, attaque/action, caractéristique et période narrative.

Toutes les données restent sur l’appareil. Aucune donnée n’est envoyée sur Internet.
