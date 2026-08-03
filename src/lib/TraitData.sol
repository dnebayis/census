// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TraitData
/// @notice Canonical Census trait vocabulary. Category order is part of the mint ABI.
library TraitData {
    uint256 internal constant COUNT = 9;

    function valid(bytes9 traits_) internal pure returns (bool) {
        return uint8(traits_[0]) < 12 && uint8(traits_[1]) < 3 && uint8(traits_[2]) < 17 && uint8(traits_[3]) < 16
            && uint8(traits_[4]) < 14 && uint8(traits_[5]) < 12 && uint8(traits_[6]) < 16 && uint8(traits_[7]) < 14
            && uint8(traits_[8]) < 16;
    }

    function key(uint256 category) internal pure returns (string memory) {
        if (category == 0) return "trait[species]";
        if (category == 1) return "trait[age]";
        if (category == 2) return "trait[hair]";
        if (category == 3) return "trait[eyes]";
        if (category == 4) return "trait[facial]";
        if (category == 5) return "trait[expression]";
        if (category == 6) return "trait[headwear]";
        if (category == 7) return "trait[attire]";
        if (category == 8) return "trait[accessory]";
        revert();
    }

    function label(uint256 category) internal pure returns (string memory) {
        if (category == 0) return "Species";
        if (category == 1) return "Age";
        if (category == 2) return "Hair";
        if (category == 3) return "Eyes";
        if (category == 4) return "Facial";
        if (category == 5) return "Expression";
        if (category == 6) return "Headwear";
        if (category == 7) return "Attire";
        if (category == 8) return "Accessory";
        revert();
    }

    function value(uint256 category, uint8 option) internal pure returns (string memory) {
        if (category == 0) return _species(option);
        if (category == 1) return _age(option);
        if (category == 2) return _hair(option);
        if (category == 3) return _eyes(option);
        if (category == 4) return _facial(option);
        if (category == 5) return _expression(option);
        if (category == 6) return _headwear(option);
        if (category == 7) return _attire(option);
        if (category == 8) return _accessory(option);
        revert();
    }

    /// @notice Visual class derived only from the immutable Species trait.
    /// @dev Human is 0, android is 3, and skull-faced is 4. Every other
    ///      non-human species belongs to Alien.
    function className(uint8 species) internal pure returns (string memory) {
        if (species == 0) return "Human";
        if (species == 3) return "Agent";
        if (species == 4) return "Skull";
        if (species < 12) return "Alien";
        revert();
    }

    function _species(uint8 i) private pure returns (string memory) {
        if (i == 0) return "Human";
        if (i == 1) return "Cat-like Humanoid";
        if (i == 2) return "Grey Alien";
        if (i == 3) return "Android with Visible Seams";
        if (i == 4) return "Skull-faced Figure";
        if (i == 5) return "Reptilian Humanoid";
        if (i == 6) return "Ape-like Humanoid";
        if (i == 7) return "Insectoid Humanoid";
        if (i == 8) return "Aquatic Humanoid";
        if (i == 9) return "Horned Alien";
        if (i == 10) return "Crystalline Being";
        if (i == 11) return "Avian Humanoid";
        revert();
    }

    function _age(uint8 i) private pure returns (string memory) {
        if (i == 0) return "Young";
        if (i == 1) return "Middle-aged";
        if (i == 2) return "Old";
        revert();
    }

    function _hair(uint8 i) private pure returns (string memory) {
        if (i == 0) return "Bald";
        if (i == 1) return "Short Cropped Hair";
        if (i == 2) return "Messy Shoulder-length Hair";
        if (i == 3) return "Long Straight Hair";
        if (i == 4) return "High Ponytail";
        if (i == 5) return "Buzz Cut";
        if (i == 6) return "Afro";
        if (i == 7) return "Mohawk";
        if (i == 8) return "Slicked-back Hair";
        if (i == 9) return "Twin Braids";
        if (i == 10) return "Topknot";
        if (i == 11) return "Receding Hairline";
        if (i == 12) return "Wild Curly Hair";
        if (i == 13) return "Textured Crop";
        if (i == 14) return "Dreadlocks";
        if (i == 15) return "Bob Cut";
        if (i == 16) return "Shaved Geometric Pattern";
        revert();
    }

    function _eyes(uint8 i) private pure returns (string memory) {
        if (i == 0) return "Plain Eyes";
        if (i == 1) return "Narrow Eyes";
        if (i == 2) return "Wide Staring Eyes";
        if (i == 3) return "Heavy-lidded Tired Eyes";
        if (i == 4) return "One Eye Scarred Shut";
        if (i == 5) return "Round Spectacles";
        if (i == 6) return "Thick Square Glasses";
        if (i == 7) return "Dark Sunglasses";
        if (i == 8) return "Single Large Eye";
        if (i == 9) return "Forehead Goggles";
        if (i == 10) return "Mirrored Visor";
        if (i == 11) return "Eyepatch";
        if (i == 12) return "VR Headset";
        if (i == 13) return "Cybernetic Lens";
        if (i == 14) return "Luminous Eyes";
        if (i == 15) return "Wraparound Glasses";
        revert();
    }

    function _facial(uint8 i) private pure returns (string memory) {
        if (i == 0) return "Clean Shaven";
        if (i == 1) return "Stubble";
        if (i == 2) return "Full Beard";
        if (i == 3) return "Goatee";
        if (i == 4) return "Thick Moustache";
        if (i == 5) return "Muttonchops";
        if (i == 6) return "Scar Across One Cheek";
        if (i == 7) return "Face Tattoo";
        if (i == 8) return "Freckles";
        if (i == 9) return "Gaunt Hollow Cheeks";
        if (i == 10) return "Circuit Seams";
        if (i == 11) return "Ritual Markings";
        if (i == 12) return "Facial Piercings";
        if (i == 13) return "Split Brow Scar";
        revert();
    }

    function _expression(uint8 i) private pure returns (string memory) {
        if (i == 0) return "Neutral";
        if (i == 1) return "Slight Frown";
        if (i == 2) return "Faint Smile";
        if (i == 3) return "Grim Set Jaw";
        if (i == 4) return "One Raised Eyebrow";
        if (i == 5) return "Exhausted";
        if (i == 6) return "Smirk";
        if (i == 7) return "Wide-eyed Alarm";
        if (i == 8) return "Focused";
        if (i == 9) return "Curious";
        if (i == 10) return "Stern";
        if (i == 11) return "Calm";
        revert();
    }

    function _headwear(uint8 i) private pure returns (string memory) {
        if (i == 0) return "Bare Head";
        if (i == 1) return "Flat Cap";
        if (i == 2) return "Beanie";
        if (i == 3) return "Wide-brim Hat";
        if (i == 4) return "Hood Up";
        if (i == 5) return "Bandana";
        if (i == 6) return "Headphones";
        if (i == 7) return "Crown";
        if (i == 8) return "Bucket Hat";
        if (i == 9) return "Helmet";
        if (i == 10) return "Pilot Cap";
        if (i == 11) return "Antenna Crown";
        if (i == 12) return "Tech Hood";
        if (i == 13) return "Open-face Space Helmet";
        if (i == 14) return "Head Wrap";
        if (i == 15) return "Visored Cap";
        revert();
    }

    function _attire(uint8 i) private pure returns (string memory) {
        if (i == 0) return "Plain Collar";
        if (i == 1) return "High Collar Coat";
        if (i == 2) return "Hoodie";
        if (i == 3) return "Suit and Tie";
        if (i == 4) return "Turtleneck";
        if (i == 5) return "Worker Overalls";
        if (i == 6) return "Armoured Shoulders";
        if (i == 7) return "Robe";
        if (i == 8) return "Bare Shoulders";
        if (i == 9) return "Scarf Wrapped High";
        if (i == 10) return "Techwear Jacket";
        if (i == 11) return "Flight Suit";
        if (i == 12) return "Ceremonial Armour";
        if (i == 13) return "Utility Vest";
        revert();
    }

    function _accessory(uint8 i) private pure returns (string memory) {
        if (i == 0) return "None";
        if (i == 1) return "Cigarette";
        if (i == 2) return "Earring";
        if (i == 3) return "Nose Ring";
        if (i == 4) return "Neck Tattoo";
        if (i == 5) return "Bandaged Jaw";
        if (i == 6) return "Monocle";
        if (i == 7) return "Breathing Mask";
        if (i == 8) return "Collar Tag";
        if (i == 9) return "Holographic Earpiece";
        if (i == 10) return "Respirator";
        if (i == 11) return "Data Cable";
        if (i == 12) return "Neck Interface";
        if (i == 13) return "Ear Cuff";
        if (i == 14) return "Temple Implant";
        if (i == 15) return "Shoulder Badge";
        revert();
    }
}
