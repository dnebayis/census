// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TraitData
/// @notice Canonical Census trait vocabulary. Category order is part of the mint ABI.
library TraitData {
    uint256 internal constant COUNT = 9;

    function valid(bytes9 traits_) internal pure returns (bool) {
        return uint8(traits_[0]) < 10 && uint8(traits_[1]) < 3 && uint8(traits_[2]) < 13 && uint8(traits_[3]) < 12
            && uint8(traits_[4]) < 11 && uint8(traits_[5]) < 9 && uint8(traits_[6]) < 12 && uint8(traits_[7]) < 10
            && uint8(traits_[8]) < 12;
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

    function _species(uint8 i) private pure returns (string memory) {
        if (i < 4) return "human";
        if (i == 4) return "cat-like humanoid";
        if (i == 5) return "grey alien";
        if (i == 6) return "android with visible seams";
        if (i == 7) return "skull-faced figure";
        if (i == 8) return "reptilian humanoid";
        if (i == 9) return "ape-like humanoid";
        revert();
    }

    function _age(uint8 i) private pure returns (string memory) {
        if (i == 0) return "young";
        if (i == 1) return "middle-aged";
        if (i == 2) return "old";
        revert();
    }

    function _hair(uint8 i) private pure returns (string memory) {
        if (i == 0) return "bald";
        if (i == 1) return "short cropped hair";
        if (i == 2) return "messy shoulder-length hair";
        if (i == 3) return "long straight hair";
        if (i == 4) return "high ponytail";
        if (i == 5) return "buzz cut";
        if (i == 6) return "afro";
        if (i == 7) return "mohawk";
        if (i == 8) return "slicked-back hair";
        if (i == 9) return "twin braids";
        if (i == 10) return "topknot";
        if (i == 11) return "receding hairline";
        if (i == 12) return "wild curly hair";
        revert();
    }

    function _eyes(uint8 i) private pure returns (string memory) {
        if (i == 0) return "plain eyes";
        if (i == 1) return "narrow eyes";
        if (i == 2) return "wide staring eyes";
        if (i == 3) return "heavy-lidded tired eyes";
        if (i == 4) return "one eye scarred shut";
        if (i == 5) return "round spectacles";
        if (i == 6) return "thick square glasses";
        if (i == 7) return "dark sunglasses";
        if (i == 8) return "a single large eye";
        if (i == 9) return "goggles pushed up onto the forehead";
        if (i == 10) return "mirrored visor";
        if (i == 11) return "eyepatch";
        revert();
    }

    function _facial(uint8 i) private pure returns (string memory) {
        if (i < 2) return "clean shaven";
        if (i == 2) return "stubble";
        if (i == 3) return "full beard";
        if (i == 4) return "goatee";
        if (i == 5) return "thick moustache";
        if (i == 6) return "muttonchops";
        if (i == 7) return "a scar across one cheek";
        if (i == 8) return "face tattoo";
        if (i == 9) return "freckles";
        if (i == 10) return "gaunt hollow cheeks";
        revert();
    }

    function _expression(uint8 i) private pure returns (string memory) {
        if (i < 2) return "neutral";
        if (i == 2) return "slight frown";
        if (i == 3) return "faint smile";
        if (i == 4) return "grim set jaw";
        if (i == 5) return "one raised eyebrow";
        if (i == 6) return "exhausted";
        if (i == 7) return "smirk";
        if (i == 8) return "wide-eyed alarm";
        revert();
    }

    function _headwear(uint8 i) private pure returns (string memory) {
        if (i < 3) return "bare head";
        if (i == 3) return "flat cap";
        if (i == 4) return "beanie";
        if (i == 5) return "wide-brim hat";
        if (i == 6) return "hood up";
        if (i == 7) return "bandana";
        if (i == 8) return "headphones";
        if (i == 9) return "crown";
        if (i == 10) return "bucket hat";
        if (i == 11) return "helmet";
        revert();
    }

    function _attire(uint8 i) private pure returns (string memory) {
        if (i == 0) return "plain collar";
        if (i == 1) return "high collar coat";
        if (i == 2) return "hoodie";
        if (i == 3) return "suit and tie";
        if (i == 4) return "turtleneck";
        if (i == 5) return "worker overalls";
        if (i == 6) return "armoured shoulders";
        if (i == 7) return "robe";
        if (i == 8) return "bare shoulders";
        if (i == 9) return "scarf wrapped high";
        revert();
    }

    function _accessory(uint8 i) private pure returns (string memory) {
        if (i < 4) return "none";
        if (i == 4) return "cigarette";
        if (i == 5) return "earring";
        if (i == 6) return "nose ring";
        if (i == 7) return "neck tattoo";
        if (i == 8) return "bandaged jaw";
        if (i == 9) return "monocle";
        if (i == 10) return "breathing mask";
        if (i == 11) return "collar tag";
        revert();
    }
}
