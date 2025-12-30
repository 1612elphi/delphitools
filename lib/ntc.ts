const ntcColours: { name: string; hex: string }[] = [
  {
    "name": "Black",
    "hex": "000000"
  },
  {
    "name": "Navy Blue",
    "hex": "000080"
  },
  {
    "name": "Dark Blue",
    "hex": "0000C8"
  },
  {
    "name": "Blue",
    "hex": "0000FF"
  },
  {
    "name": "Stratos",
    "hex": "000741"
  },
  {
    "name": "Swamp",
    "hex": "001B1C"
  },
  {
    "name": "Resolution Blue",
    "hex": "002387"
  },
  {
    "name": "Deep Fir",
    "hex": "002900"
  },
  {
    "name": "Burnham",
    "hex": "002E20"
  },
  {
    "name": "International Klein Blue",
    "hex": "002FA7"
  },
  {
    "name": "Prussian Blue",
    "hex": "003153"
  },
  {
    "name": "Midnight Blue",
    "hex": "003366"
  },
  {
    "name": "Smalt",
    "hex": "003399"
  },
  {
    "name": "Deep Teal",
    "hex": "003532"
  },
  {
    "name": "Cyprus",
    "hex": "003E40"
  },
  {
    "name": "Kaitoke Green",
    "hex": "004620"
  },
  {
    "name": "Cobalt",
    "hex": "0047AB"
  },
  {
    "name": "Crusoe",
    "hex": "004816"
  },
  {
    "name": "Sherpa Blue",
    "hex": "004950"
  },
  {
    "name": "Endeavour",
    "hex": "0056A7"
  },
  {
    "name": "Camarone",
    "hex": "00581A"
  },
  {
    "name": "Science Blue",
    "hex": "0066CC"
  },
  {
    "name": "Blue Ribbon",
    "hex": "0066FF"
  },
  {
    "name": "Tropical Rain Forest",
    "hex": "00755E"
  },
  {
    "name": "Allports",
    "hex": "0076A3"
  },
  {
    "name": "Deep Cerulean",
    "hex": "007BA7"
  },
  {
    "name": "Lochmara",
    "hex": "007EC7"
  },
  {
    "name": "Azure Radiance",
    "hex": "007FFF"
  },
  {
    "name": "Teal",
    "hex": "008080"
  },
  {
    "name": "Bondi Blue",
    "hex": "0095B6"
  },
  {
    "name": "Pacific Blue",
    "hex": "009DC4"
  },
  {
    "name": "Persian Green",
    "hex": "00A693"
  },
  {
    "name": "Jade",
    "hex": "00A86B"
  },
  {
    "name": "Caribbean Green",
    "hex": "00CC99"
  },
  {
    "name": "Robin's Egg Blue",
    "hex": "00CCCC"
  },
  {
    "name": "Green",
    "hex": "00FF00"
  },
  {
    "name": "Spring Green",
    "hex": "00FF7F"
  },
  {
    "name": "Cyan / Aqua",
    "hex": "00FFFF"
  },
  {
    "name": "Blue Charcoal",
    "hex": "010D1A"
  },
  {
    "name": "Midnight",
    "hex": "011635"
  },
  {
    "name": "Holly",
    "hex": "011D13"
  },
  {
    "name": "Daintree",
    "hex": "012731"
  },
  {
    "name": "Cardin Green",
    "hex": "01361C"
  },
  {
    "name": "County Green",
    "hex": "01371A"
  },
  {
    "name": "Astronaut Blue",
    "hex": "013E62"
  },
  {
    "name": "Regal Blue",
    "hex": "013F6A"
  },
  {
    "name": "Aqua Deep",
    "hex": "014B43"
  },
  {
    "name": "Orient",
    "hex": "015E85"
  },
  {
    "name": "Blue Stone",
    "hex": "016162"
  },
  {
    "name": "Fun Green",
    "hex": "016D39"
  },
  {
    "name": "Pine Green",
    "hex": "01796F"
  },
  {
    "name": "Blue Lagoon",
    "hex": "017987"
  },
  {
    "name": "Deep Sea",
    "hex": "01826B"
  },
  {
    "name": "Green Haze",
    "hex": "01A368"
  },
  {
    "name": "English Holly",
    "hex": "022D15"
  },
  {
    "name": "Sherwood Green",
    "hex": "02402C"
  },
  {
    "name": "Congress Blue",
    "hex": "02478E"
  },
  {
    "name": "Evening Sea",
    "hex": "024E46"
  },
  {
    "name": "Bahama Blue",
    "hex": "026395"
  },
  {
    "name": "Observatory",
    "hex": "02866F"
  },
  {
    "name": "Cerulean",
    "hex": "02A4D3"
  },
  {
    "name": "Tangaroa",
    "hex": "03163C"
  },
  {
    "name": "Green Vogue",
    "hex": "032B52"
  },
  {
    "name": "Mosque",
    "hex": "036A6E"
  },
  {
    "name": "Midnight Moss",
    "hex": "041004"
  },
  {
    "name": "Black Pearl",
    "hex": "041322"
  },
  {
    "name": "Blue Whale",
    "hex": "042E4C"
  },
  {
    "name": "Zuccini",
    "hex": "044022"
  },
  {
    "name": "Teal Blue",
    "hex": "044259"
  },
  {
    "name": "Deep Cove",
    "hex": "051040"
  },
  {
    "name": "Gulf Blue",
    "hex": "051657"
  },
  {
    "name": "Venice Blue",
    "hex": "055989"
  },
  {
    "name": "Watercourse",
    "hex": "056F57"
  },
  {
    "name": "Catalina Blue",
    "hex": "062A78"
  },
  {
    "name": "Tiber",
    "hex": "063537"
  },
  {
    "name": "Gossamer",
    "hex": "069B81"
  },
  {
    "name": "Niagara",
    "hex": "06A189"
  },
  {
    "name": "Tarawera",
    "hex": "073A50"
  },
  {
    "name": "Jaguar",
    "hex": "080110"
  },
  {
    "name": "Black Bean",
    "hex": "081910"
  },
  {
    "name": "Deep Sapphire",
    "hex": "082567"
  },
  {
    "name": "Elf Green",
    "hex": "088370"
  },
  {
    "name": "Bright Turquoise",
    "hex": "08E8DE"
  },
  {
    "name": "Downriver",
    "hex": "092256"
  },
  {
    "name": "Palm Green",
    "hex": "09230F"
  },
  {
    "name": "Madison",
    "hex": "09255D"
  },
  {
    "name": "Bottle Green",
    "hex": "093624"
  },
  {
    "name": "Deep Sea Green",
    "hex": "095859"
  },
  {
    "name": "Salem",
    "hex": "097F4B"
  },
  {
    "name": "Black Russian",
    "hex": "0A001C"
  },
  {
    "name": "Dark Fern",
    "hex": "0A480D"
  },
  {
    "name": "Japanese Laurel",
    "hex": "0A6906"
  },
  {
    "name": "Atoll",
    "hex": "0A6F75"
  },
  {
    "name": "Cod Gray",
    "hex": "0B0B0B"
  },
  {
    "name": "Marshland",
    "hex": "0B0F08"
  },
  {
    "name": "Gordons Green",
    "hex": "0B1107"
  },
  {
    "name": "Black Forest",
    "hex": "0B1304"
  },
  {
    "name": "San Felix",
    "hex": "0B6207"
  },
  {
    "name": "Malachite",
    "hex": "0BDA51"
  },
  {
    "name": "Ebony",
    "hex": "0C0B1D"
  },
  {
    "name": "Woodsmoke",
    "hex": "0C0D0F"
  },
  {
    "name": "Racing Green",
    "hex": "0C1911"
  },
  {
    "name": "Surfie Green",
    "hex": "0C7A79"
  },
  {
    "name": "Blue Chill",
    "hex": "0C8990"
  },
  {
    "name": "Black Rock",
    "hex": "0D0332"
  },
  {
    "name": "Bunker",
    "hex": "0D1117"
  },
  {
    "name": "Aztec",
    "hex": "0D1C19"
  },
  {
    "name": "Bush",
    "hex": "0D2E1C"
  },
  {
    "name": "Cinder",
    "hex": "0E0E18"
  },
  {
    "name": "Firefly",
    "hex": "0E2A30"
  },
  {
    "name": "Torea Bay",
    "hex": "0F2D9E"
  },
  {
    "name": "Vulcan",
    "hex": "10121D"
  },
  {
    "name": "Green Waterloo",
    "hex": "101405"
  },
  {
    "name": "Eden",
    "hex": "105852"
  },
  {
    "name": "Arapawa",
    "hex": "110C6C"
  },
  {
    "name": "Ultramarine",
    "hex": "120A8F"
  },
  {
    "name": "Elephant",
    "hex": "123447"
  },
  {
    "name": "Jewel",
    "hex": "126B40"
  },
  {
    "name": "Diesel",
    "hex": "130000"
  },
  {
    "name": "Asphalt",
    "hex": "130A06"
  },
  {
    "name": "Blue Zodiac",
    "hex": "13264D"
  },
  {
    "name": "Parsley",
    "hex": "134F19"
  },
  {
    "name": "Nero",
    "hex": "140600"
  },
  {
    "name": "Tory Blue",
    "hex": "1450AA"
  },
  {
    "name": "Bunting",
    "hex": "151F4C"
  },
  {
    "name": "Denim",
    "hex": "1560BD"
  },
  {
    "name": "Genoa",
    "hex": "15736B"
  },
  {
    "name": "Mirage",
    "hex": "161928"
  },
  {
    "name": "Hunter Green",
    "hex": "161D10"
  },
  {
    "name": "Big Stone",
    "hex": "162A40"
  },
  {
    "name": "Celtic",
    "hex": "163222"
  },
  {
    "name": "Timber Green",
    "hex": "16322C"
  },
  {
    "name": "Gable Green",
    "hex": "163531"
  },
  {
    "name": "Pine Tree",
    "hex": "171F04"
  },
  {
    "name": "Chathams Blue",
    "hex": "175579"
  },
  {
    "name": "Deep Forest Green",
    "hex": "182D09"
  },
  {
    "name": "Blumine",
    "hex": "18587A"
  },
  {
    "name": "Palm Leaf",
    "hex": "19330E"
  },
  {
    "name": "Nile Blue",
    "hex": "193751"
  },
  {
    "name": "Fun Blue",
    "hex": "1959A8"
  },
  {
    "name": "Lucky Point",
    "hex": "1A1A68"
  },
  {
    "name": "Mountain Meadow",
    "hex": "1AB385"
  },
  {
    "name": "Tolopea",
    "hex": "1B0245"
  },
  {
    "name": "Haiti",
    "hex": "1B1035"
  },
  {
    "name": "Deep Koamaru",
    "hex": "1B127B"
  },
  {
    "name": "Acadia",
    "hex": "1B1404"
  },
  {
    "name": "Seaweed",
    "hex": "1B2F11"
  },
  {
    "name": "Biscay",
    "hex": "1B3162"
  },
  {
    "name": "Matisse",
    "hex": "1B659D"
  },
  {
    "name": "Crowshead",
    "hex": "1C1208"
  },
  {
    "name": "Rangoon Green",
    "hex": "1C1E13"
  },
  {
    "name": "Persian Blue",
    "hex": "1C39BB"
  },
  {
    "name": "Everglade",
    "hex": "1C402E"
  },
  {
    "name": "Elm",
    "hex": "1C7C7D"
  },
  {
    "name": "Green Pea",
    "hex": "1D6142"
  },
  {
    "name": "Creole",
    "hex": "1E0F04"
  },
  {
    "name": "Karaka",
    "hex": "1E1609"
  },
  {
    "name": "El Paso",
    "hex": "1E1708"
  },
  {
    "name": "Cello",
    "hex": "1E385B"
  },
  {
    "name": "Te Papa Green",
    "hex": "1E433C"
  },
  {
    "name": "Dodger Blue",
    "hex": "1E90FF"
  },
  {
    "name": "Eastern Blue",
    "hex": "1E9AB0"
  },
  {
    "name": "Night Rider",
    "hex": "1F120F"
  },
  {
    "name": "Java",
    "hex": "1FC2C2"
  },
  {
    "name": "Jacksons Purple",
    "hex": "20208D"
  },
  {
    "name": "Cloud Burst",
    "hex": "202E54"
  },
  {
    "name": "Blue Dianne",
    "hex": "204852"
  },
  {
    "name": "Eternity",
    "hex": "211A0E"
  },
  {
    "name": "Deep Blue",
    "hex": "220878"
  },
  {
    "name": "Forest Green",
    "hex": "228B22"
  },
  {
    "name": "Mallard",
    "hex": "233418"
  },
  {
    "name": "Violet",
    "hex": "240A40"
  },
  {
    "name": "Kilamanjaro",
    "hex": "240C02"
  },
  {
    "name": "Log Cabin",
    "hex": "242A1D"
  },
  {
    "name": "Black Olive",
    "hex": "242E16"
  },
  {
    "name": "Green House",
    "hex": "24500F"
  },
  {
    "name": "Graphite",
    "hex": "251607"
  },
  {
    "name": "Cannon Black",
    "hex": "251706"
  },
  {
    "name": "Port Gore",
    "hex": "251F4F"
  },
  {
    "name": "Shark",
    "hex": "25272C"
  },
  {
    "name": "Green Kelp",
    "hex": "25311C"
  },
  {
    "name": "Curious Blue",
    "hex": "2596D1"
  },
  {
    "name": "Paua",
    "hex": "260368"
  },
  {
    "name": "Paris M",
    "hex": "26056A"
  },
  {
    "name": "Wood Bark",
    "hex": "261105"
  },
  {
    "name": "Gondola",
    "hex": "261414"
  },
  {
    "name": "Steel Gray",
    "hex": "262335"
  },
  {
    "name": "Ebony Clay",
    "hex": "26283B"
  },
  {
    "name": "Bay of Many",
    "hex": "273A81"
  },
  {
    "name": "Plantation",
    "hex": "27504B"
  },
  {
    "name": "Eucalyptus",
    "hex": "278A5B"
  },
  {
    "name": "Oil",
    "hex": "281E15"
  },
  {
    "name": "Astronaut",
    "hex": "283A77"
  },
  {
    "name": "Mariner",
    "hex": "286ACD"
  },
  {
    "name": "Violent Violet",
    "hex": "290C5E"
  },
  {
    "name": "Bastille",
    "hex": "292130"
  },
  {
    "name": "Zeus",
    "hex": "292319"
  },
  {
    "name": "Charade",
    "hex": "292937"
  },
  {
    "name": "Jelly Bean",
    "hex": "297B9A"
  },
  {
    "name": "Jungle Green",
    "hex": "29AB87"
  },
  {
    "name": "Cherry Pie",
    "hex": "2A0359"
  },
  {
    "name": "Coffee Bean",
    "hex": "2A140E"
  },
  {
    "name": "Baltic Sea",
    "hex": "2A2630"
  },
  {
    "name": "Turtle Green",
    "hex": "2A380B"
  },
  {
    "name": "Cerulean Blue",
    "hex": "2A52BE"
  },
  {
    "name": "Sepia Black",
    "hex": "2B0202"
  },
  {
    "name": "Valhalla",
    "hex": "2B194F"
  },
  {
    "name": "Heavy Metal",
    "hex": "2B3228"
  },
  {
    "name": "Blue Gem",
    "hex": "2C0E8C"
  },
  {
    "name": "Revolver",
    "hex": "2C1632"
  },
  {
    "name": "Bleached Cedar",
    "hex": "2C2133"
  },
  {
    "name": "Lochinvar",
    "hex": "2C8C84"
  },
  {
    "name": "Mikado",
    "hex": "2D2510"
  },
  {
    "name": "Outer Space",
    "hex": "2D383A"
  },
  {
    "name": "St Tropaz",
    "hex": "2D569B"
  },
  {
    "name": "Jacaranda",
    "hex": "2E0329"
  },
  {
    "name": "Jacko Bean",
    "hex": "2E1905"
  },
  {
    "name": "Rangitoto",
    "hex": "2E3222"
  },
  {
    "name": "Rhino",
    "hex": "2E3F62"
  },
  {
    "name": "Sea Green",
    "hex": "2E8B57"
  },
  {
    "name": "Scooter",
    "hex": "2EBFD4"
  },
  {
    "name": "Onion",
    "hex": "2F270E"
  },
  {
    "name": "Governor Bay",
    "hex": "2F3CB3"
  },
  {
    "name": "Sapphire",
    "hex": "2F519E"
  },
  {
    "name": "Spectra",
    "hex": "2F5A57"
  },
  {
    "name": "Casal",
    "hex": "2F6168"
  },
  {
    "name": "Melanzane",
    "hex": "300529"
  },
  {
    "name": "Cocoa Brown",
    "hex": "301F1E"
  },
  {
    "name": "Woodrush",
    "hex": "302A0F"
  },
  {
    "name": "San Juan",
    "hex": "304B6A"
  },
  {
    "name": "Turquoise",
    "hex": "30D5C8"
  },
  {
    "name": "Eclipse",
    "hex": "311C17"
  },
  {
    "name": "Pickled Bluewood",
    "hex": "314459"
  },
  {
    "name": "Azure",
    "hex": "315BA1"
  },
  {
    "name": "Calypso",
    "hex": "31728D"
  },
  {
    "name": "Paradiso",
    "hex": "317D82"
  },
  {
    "name": "Persian Indigo",
    "hex": "32127A"
  },
  {
    "name": "Blackcurrant",
    "hex": "32293A"
  },
  {
    "name": "Mine Shaft",
    "hex": "323232"
  },
  {
    "name": "Stromboli",
    "hex": "325D52"
  },
  {
    "name": "Bilbao",
    "hex": "327C14"
  },
  {
    "name": "Astral",
    "hex": "327DA0"
  },
  {
    "name": "Christalle",
    "hex": "33036B"
  },
  {
    "name": "Thunder",
    "hex": "33292F"
  },
  {
    "name": "Shamrock",
    "hex": "33CC99"
  },
  {
    "name": "Tamarind",
    "hex": "341515"
  },
  {
    "name": "Mardi Gras",
    "hex": "350036"
  },
  {
    "name": "Valentino",
    "hex": "350E42"
  },
  {
    "name": "Jagger",
    "hex": "350E57"
  },
  {
    "name": "Tuna",
    "hex": "353542"
  },
  {
    "name": "Chambray",
    "hex": "354E8C"
  },
  {
    "name": "Martinique",
    "hex": "363050"
  },
  {
    "name": "Tuatara",
    "hex": "363534"
  },
  {
    "name": "Waiouru",
    "hex": "363C0D"
  },
  {
    "name": "Ming",
    "hex": "36747D"
  },
  {
    "name": "La Palma",
    "hex": "368716"
  },
  {
    "name": "Chocolate",
    "hex": "370202"
  },
  {
    "name": "Clinker",
    "hex": "371D09"
  },
  {
    "name": "Brown Tumbleweed",
    "hex": "37290E"
  },
  {
    "name": "Birch",
    "hex": "373021"
  },
  {
    "name": "Oracle",
    "hex": "377475"
  },
  {
    "name": "Blue Diamond",
    "hex": "380474"
  },
  {
    "name": "Grape",
    "hex": "381A51"
  },
  {
    "name": "Dune",
    "hex": "383533"
  },
  {
    "name": "Oxford Blue",
    "hex": "384555"
  },
  {
    "name": "Clover",
    "hex": "384910"
  },
  {
    "name": "Limed Spruce",
    "hex": "394851"
  },
  {
    "name": "Dell",
    "hex": "396413"
  },
  {
    "name": "Toledo",
    "hex": "3A0020"
  },
  {
    "name": "Sambuca",
    "hex": "3A2010"
  },
  {
    "name": "Jacarta",
    "hex": "3A2A6A"
  },
  {
    "name": "William",
    "hex": "3A686C"
  },
  {
    "name": "Killarney",
    "hex": "3A6A47"
  },
  {
    "name": "Keppel",
    "hex": "3AB09E"
  },
  {
    "name": "Temptress",
    "hex": "3B000B"
  },
  {
    "name": "Aubergine",
    "hex": "3B0910"
  },
  {
    "name": "Jon",
    "hex": "3B1F1F"
  },
  {
    "name": "Treehouse",
    "hex": "3B2820"
  },
  {
    "name": "Amazon",
    "hex": "3B7A57"
  },
  {
    "name": "Boston Blue",
    "hex": "3B91B4"
  },
  {
    "name": "Windsor",
    "hex": "3C0878"
  },
  {
    "name": "Rebel",
    "hex": "3C1206"
  },
  {
    "name": "Meteorite",
    "hex": "3C1F76"
  },
  {
    "name": "Dark Ebony",
    "hex": "3C2005"
  },
  {
    "name": "Camouflage",
    "hex": "3C3910"
  },
  {
    "name": "Bright Gray",
    "hex": "3C4151"
  },
  {
    "name": "Cape Cod",
    "hex": "3C4443"
  },
  {
    "name": "Lunar Green",
    "hex": "3C493A"
  },
  {
    "name": "Bean  ",
    "hex": "3D0C02"
  },
  {
    "name": "Bistre",
    "hex": "3D2B1F"
  },
  {
    "name": "Goblin",
    "hex": "3D7D52"
  },
  {
    "name": "Kingfisher Daisy",
    "hex": "3E0480"
  },
  {
    "name": "Cedar",
    "hex": "3E1C14"
  },
  {
    "name": "English Walnut",
    "hex": "3E2B23"
  },
  {
    "name": "Black Marlin",
    "hex": "3E2C1C"
  },
  {
    "name": "Ship Gray",
    "hex": "3E3A44"
  },
  {
    "name": "Pelorous",
    "hex": "3EABBF"
  },
  {
    "name": "Bronze",
    "hex": "3F2109"
  },
  {
    "name": "Cola",
    "hex": "3F2500"
  },
  {
    "name": "Madras",
    "hex": "3F3002"
  },
  {
    "name": "Minsk",
    "hex": "3F307F"
  },
  {
    "name": "Cabbage Pont",
    "hex": "3F4C3A"
  },
  {
    "name": "Tom Thumb",
    "hex": "3F583B"
  },
  {
    "name": "Mineral Green",
    "hex": "3F5D53"
  },
  {
    "name": "Puerto Rico",
    "hex": "3FC1AA"
  },
  {
    "name": "Harlequin",
    "hex": "3FFF00"
  },
  {
    "name": "Brown Pod",
    "hex": "401801"
  },
  {
    "name": "Cork",
    "hex": "40291D"
  },
  {
    "name": "Masala",
    "hex": "403B38"
  },
  {
    "name": "Thatch Green",
    "hex": "403D19"
  },
  {
    "name": "Fiord",
    "hex": "405169"
  },
  {
    "name": "Viridian",
    "hex": "40826D"
  },
  {
    "name": "Chateau Green",
    "hex": "40A860"
  },
  {
    "name": "Ripe Plum",
    "hex": "410056"
  },
  {
    "name": "Paco",
    "hex": "411F10"
  },
  {
    "name": "Deep Oak",
    "hex": "412010"
  },
  {
    "name": "Merlin",
    "hex": "413C37"
  },
  {
    "name": "Gun Powder",
    "hex": "414257"
  },
  {
    "name": "East Bay",
    "hex": "414C7D"
  },
  {
    "name": "Royal Blue",
    "hex": "4169E1"
  },
  {
    "name": "Ocean Green",
    "hex": "41AA78"
  },
  {
    "name": "Burnt Maroon",
    "hex": "420303"
  },
  {
    "name": "Lisbon Brown",
    "hex": "423921"
  },
  {
    "name": "Faded Jade",
    "hex": "427977"
  },
  {
    "name": "Scarlet Gum",
    "hex": "431560"
  },
  {
    "name": "Iroko",
    "hex": "433120"
  },
  {
    "name": "Armadillo",
    "hex": "433E37"
  },
  {
    "name": "River Bed",
    "hex": "434C59"
  },
  {
    "name": "Green Leaf",
    "hex": "436A0D"
  },
  {
    "name": "Barossa",
    "hex": "44012D"
  },
  {
    "name": "Morocco Brown",
    "hex": "441D00"
  },
  {
    "name": "Mako",
    "hex": "444954"
  },
  {
    "name": "Kelp",
    "hex": "454936"
  },
  {
    "name": "San Marino",
    "hex": "456CAC"
  },
  {
    "name": "Picton Blue",
    "hex": "45B1E8"
  },
  {
    "name": "Loulou",
    "hex": "460B41"
  },
  {
    "name": "Crater Brown",
    "hex": "462425"
  },
  {
    "name": "Gray Asparagus",
    "hex": "465945"
  },
  {
    "name": "Steel Blue",
    "hex": "4682B4"
  },
  {
    "name": "Rustic Red",
    "hex": "480404"
  },
  {
    "name": "Bulgarian Rose",
    "hex": "480607"
  },
  {
    "name": "Clairvoyant",
    "hex": "480656"
  },
  {
    "name": "Cocoa Bean",
    "hex": "481C1C"
  },
  {
    "name": "Woody Brown",
    "hex": "483131"
  },
  {
    "name": "Taupe",
    "hex": "483C32"
  },
  {
    "name": "Van Cleef",
    "hex": "49170C"
  },
  {
    "name": "Brown Derby",
    "hex": "492615"
  },
  {
    "name": "Metallic Bronze",
    "hex": "49371B"
  },
  {
    "name": "Verdun Green",
    "hex": "495400"
  },
  {
    "name": "Blue Bayoux",
    "hex": "496679"
  },
  {
    "name": "Bismark",
    "hex": "497183"
  },
  {
    "name": "Bracken",
    "hex": "4A2A04"
  },
  {
    "name": "Deep Bronze",
    "hex": "4A3004"
  },
  {
    "name": "Mondo",
    "hex": "4A3C30"
  },
  {
    "name": "Tundora",
    "hex": "4A4244"
  },
  {
    "name": "Gravel",
    "hex": "4A444B"
  },
  {
    "name": "Trout",
    "hex": "4A4E5A"
  },
  {
    "name": "Pigment Indigo",
    "hex": "4B0082"
  },
  {
    "name": "Nandor",
    "hex": "4B5D52"
  },
  {
    "name": "Saddle",
    "hex": "4C3024"
  },
  {
    "name": "Abbey",
    "hex": "4C4F56"
  },
  {
    "name": "Blackberry",
    "hex": "4D0135"
  },
  {
    "name": "Cab Sav",
    "hex": "4D0A18"
  },
  {
    "name": "Indian Tan",
    "hex": "4D1E01"
  },
  {
    "name": "Cowboy",
    "hex": "4D282D"
  },
  {
    "name": "Livid Brown",
    "hex": "4D282E"
  },
  {
    "name": "Rock",
    "hex": "4D3833"
  },
  {
    "name": "Punga",
    "hex": "4D3D14"
  },
  {
    "name": "Bronzetone",
    "hex": "4D400F"
  },
  {
    "name": "Woodland",
    "hex": "4D5328"
  },
  {
    "name": "Mahogany",
    "hex": "4E0606"
  },
  {
    "name": "Bossanova",
    "hex": "4E2A5A"
  },
  {
    "name": "Matterhorn",
    "hex": "4E3B41"
  },
  {
    "name": "Bronze Olive",
    "hex": "4E420C"
  },
  {
    "name": "Mulled Wine",
    "hex": "4E4562"
  },
  {
    "name": "Axolotl",
    "hex": "4E6649"
  },
  {
    "name": "Wedgewood",
    "hex": "4E7F9E"
  },
  {
    "name": "Shakespeare",
    "hex": "4EABD1"
  },
  {
    "name": "Honey Flower",
    "hex": "4F1C70"
  },
  {
    "name": "Daisy Bush",
    "hex": "4F2398"
  },
  {
    "name": "Indigo",
    "hex": "4F69C6"
  },
  {
    "name": "Fern Green",
    "hex": "4F7942"
  },
  {
    "name": "Fruit Salad",
    "hex": "4F9D5D"
  },
  {
    "name": "Apple",
    "hex": "4FA83D"
  },
  {
    "name": "Mortar",
    "hex": "504351"
  },
  {
    "name": "Kashmir Blue",
    "hex": "507096"
  },
  {
    "name": "Cutty Sark",
    "hex": "507672"
  },
  {
    "name": "Emerald",
    "hex": "50C878"
  },
  {
    "name": "Emperor",
    "hex": "514649"
  },
  {
    "name": "Chalet Green",
    "hex": "516E3D"
  },
  {
    "name": "Como",
    "hex": "517C66"
  },
  {
    "name": "Smalt Blue",
    "hex": "51808F"
  },
  {
    "name": "Castro",
    "hex": "52001F"
  },
  {
    "name": "Maroon Oak",
    "hex": "520C17"
  },
  {
    "name": "Gigas",
    "hex": "523C94"
  },
  {
    "name": "Voodoo",
    "hex": "533455"
  },
  {
    "name": "Victoria",
    "hex": "534491"
  },
  {
    "name": "Hippie Green",
    "hex": "53824B"
  },
  {
    "name": "Heath",
    "hex": "541012"
  },
  {
    "name": "Judge Gray",
    "hex": "544333"
  },
  {
    "name": "Fuscous Gray",
    "hex": "54534D"
  },
  {
    "name": "Vida Loca",
    "hex": "549019"
  },
  {
    "name": "Cioccolato",
    "hex": "55280C"
  },
  {
    "name": "Saratoga",
    "hex": "555B10"
  },
  {
    "name": "Finlandia",
    "hex": "556D56"
  },
  {
    "name": "Havelock Blue",
    "hex": "5590D9"
  },
  {
    "name": "Fountain Blue",
    "hex": "56B4BE"
  },
  {
    "name": "Spring Leaves",
    "hex": "578363"
  },
  {
    "name": "Saddle Brown",
    "hex": "583401"
  },
  {
    "name": "Scarpa Flow",
    "hex": "585562"
  },
  {
    "name": "Cactus",
    "hex": "587156"
  },
  {
    "name": "Hippie Blue",
    "hex": "589AAF"
  },
  {
    "name": "Wine Berry",
    "hex": "591D35"
  },
  {
    "name": "Brown Bramble",
    "hex": "592804"
  },
  {
    "name": "Congo Brown",
    "hex": "593737"
  },
  {
    "name": "Millbrook",
    "hex": "594433"
  },
  {
    "name": "Waikawa Gray",
    "hex": "5A6E9C"
  },
  {
    "name": "Horizon",
    "hex": "5A87A0"
  },
  {
    "name": "Jambalaya",
    "hex": "5B3013"
  },
  {
    "name": "Bordeaux",
    "hex": "5C0120"
  },
  {
    "name": "Mulberry Wood",
    "hex": "5C0536"
  },
  {
    "name": "Carnaby Tan",
    "hex": "5C2E01"
  },
  {
    "name": "Comet",
    "hex": "5C5D75"
  },
  {
    "name": "Redwood",
    "hex": "5D1E0F"
  },
  {
    "name": "Don Juan",
    "hex": "5D4C51"
  },
  {
    "name": "Chicago",
    "hex": "5D5C58"
  },
  {
    "name": "Verdigris",
    "hex": "5D5E37"
  },
  {
    "name": "Dingley",
    "hex": "5D7747"
  },
  {
    "name": "Breaker Bay",
    "hex": "5DA19F"
  },
  {
    "name": "Kabul",
    "hex": "5E483E"
  },
  {
    "name": "Hemlock",
    "hex": "5E5D3B"
  },
  {
    "name": "Irish Coffee",
    "hex": "5F3D26"
  },
  {
    "name": "Mid Gray",
    "hex": "5F5F6E"
  },
  {
    "name": "Shuttle Gray",
    "hex": "5F6672"
  },
  {
    "name": "Aqua Forest",
    "hex": "5FA777"
  },
  {
    "name": "Tradewind",
    "hex": "5FB3AC"
  },
  {
    "name": "Horses Neck",
    "hex": "604913"
  },
  {
    "name": "Smoky",
    "hex": "605B73"
  },
  {
    "name": "Corduroy",
    "hex": "606E68"
  },
  {
    "name": "Danube",
    "hex": "6093D1"
  },
  {
    "name": "Espresso",
    "hex": "612718"
  },
  {
    "name": "Eggplant",
    "hex": "614051"
  },
  {
    "name": "Costa Del Sol",
    "hex": "615D30"
  },
  {
    "name": "Glade Green",
    "hex": "61845F"
  },
  {
    "name": "Buccaneer",
    "hex": "622F30"
  },
  {
    "name": "Quincy",
    "hex": "623F2D"
  },
  {
    "name": "Butterfly Bush",
    "hex": "624E9A"
  },
  {
    "name": "West Coast",
    "hex": "625119"
  },
  {
    "name": "Finch",
    "hex": "626649"
  },
  {
    "name": "Patina",
    "hex": "639A8F"
  },
  {
    "name": "Fern",
    "hex": "63B76C"
  },
  {
    "name": "Blue Violet",
    "hex": "6456B7"
  },
  {
    "name": "Dolphin",
    "hex": "646077"
  },
  {
    "name": "Storm Dust",
    "hex": "646463"
  },
  {
    "name": "Siam",
    "hex": "646A54"
  },
  {
    "name": "Nevada",
    "hex": "646E75"
  },
  {
    "name": "Cornflower Blue",
    "hex": "6495ED"
  },
  {
    "name": "Viking",
    "hex": "64CCDB"
  },
  {
    "name": "Rosewood",
    "hex": "65000B"
  },
  {
    "name": "Cherrywood",
    "hex": "651A14"
  },
  {
    "name": "Purple Heart",
    "hex": "652DC1"
  },
  {
    "name": "Fern Frond",
    "hex": "657220"
  },
  {
    "name": "Willow Grove",
    "hex": "65745D"
  },
  {
    "name": "Hoki",
    "hex": "65869F"
  },
  {
    "name": "Pompadour",
    "hex": "660045"
  },
  {
    "name": "Purple",
    "hex": "660099"
  },
  {
    "name": "Tyrian Purple",
    "hex": "66023C"
  },
  {
    "name": "Dark Tan",
    "hex": "661010"
  },
  {
    "name": "Silver Tree",
    "hex": "66B58F"
  },
  {
    "name": "Bright Green",
    "hex": "66FF00"
  },
  {
    "name": "Screamin' Green",
    "hex": "66FF66"
  },
  {
    "name": "Black Rose",
    "hex": "67032D"
  },
  {
    "name": "Scampi",
    "hex": "675FA6"
  },
  {
    "name": "Ironside Gray",
    "hex": "676662"
  },
  {
    "name": "Viridian Green",
    "hex": "678975"
  },
  {
    "name": "Christi",
    "hex": "67A712"
  },
  {
    "name": "Nutmeg Wood Finish",
    "hex": "683600"
  },
  {
    "name": "Zambezi",
    "hex": "685558"
  },
  {
    "name": "Salt Box",
    "hex": "685E6E"
  },
  {
    "name": "Tawny Port",
    "hex": "692545"
  },
  {
    "name": "Finn",
    "hex": "692D54"
  },
  {
    "name": "Scorpion",
    "hex": "695F62"
  },
  {
    "name": "Lynch",
    "hex": "697E9A"
  },
  {
    "name": "Spice",
    "hex": "6A442E"
  },
  {
    "name": "Himalaya",
    "hex": "6A5D1B"
  },
  {
    "name": "Soya Bean",
    "hex": "6A6051"
  },
  {
    "name": "Hairy Heath",
    "hex": "6B2A14"
  },
  {
    "name": "Royal Purple",
    "hex": "6B3FA0"
  },
  {
    "name": "Shingle Fawn",
    "hex": "6B4E31"
  },
  {
    "name": "Dorado",
    "hex": "6B5755"
  },
  {
    "name": "Bermuda Gray",
    "hex": "6B8BA2"
  },
  {
    "name": "Olive Drab",
    "hex": "6B8E23"
  },
  {
    "name": "Eminence",
    "hex": "6C3082"
  },
  {
    "name": "Turquoise Blue",
    "hex": "6CDAE7"
  },
  {
    "name": "Lonestar",
    "hex": "6D0101"
  },
  {
    "name": "Pine Cone",
    "hex": "6D5E54"
  },
  {
    "name": "Dove Gray",
    "hex": "6D6C6C"
  },
  {
    "name": "Juniper",
    "hex": "6D9292"
  },
  {
    "name": "Gothic",
    "hex": "6D92A1"
  },
  {
    "name": "Red Oxide",
    "hex": "6E0902"
  },
  {
    "name": "Moccaccino",
    "hex": "6E1D14"
  },
  {
    "name": "Pickled Bean",
    "hex": "6E4826"
  },
  {
    "name": "Dallas",
    "hex": "6E4B26"
  },
  {
    "name": "Kokoda",
    "hex": "6E6D57"
  },
  {
    "name": "Pale Sky",
    "hex": "6E7783"
  },
  {
    "name": "Cafe Royale",
    "hex": "6F440C"
  },
  {
    "name": "Flint",
    "hex": "6F6A61"
  },
  {
    "name": "Highland",
    "hex": "6F8E63"
  },
  {
    "name": "Limeade",
    "hex": "6F9D02"
  },
  {
    "name": "Downy",
    "hex": "6FD0C5"
  },
  {
    "name": "Persian Plum",
    "hex": "701C1C"
  },
  {
    "name": "Sepia",
    "hex": "704214"
  },
  {
    "name": "Antique Bronze",
    "hex": "704A07"
  },
  {
    "name": "Ferra",
    "hex": "704F50"
  },
  {
    "name": "Coffee",
    "hex": "706555"
  },
  {
    "name": "Slate Gray",
    "hex": "708090"
  },
  {
    "name": "Cedar Wood Finish",
    "hex": "711A00"
  },
  {
    "name": "Metallic Copper",
    "hex": "71291D"
  },
  {
    "name": "Affair",
    "hex": "714693"
  },
  {
    "name": "Studio",
    "hex": "714AB2"
  },
  {
    "name": "Tobacco Brown",
    "hex": "715D47"
  },
  {
    "name": "Yellow Metal",
    "hex": "716338"
  },
  {
    "name": "Peat",
    "hex": "716B56"
  },
  {
    "name": "Olivetone",
    "hex": "716E10"
  },
  {
    "name": "Storm Gray",
    "hex": "717486"
  },
  {
    "name": "Sirocco",
    "hex": "718080"
  },
  {
    "name": "Aquamarine Blue",
    "hex": "71D9E2"
  },
  {
    "name": "Venetian Red",
    "hex": "72010F"
  },
  {
    "name": "Old Copper",
    "hex": "724A2F"
  },
  {
    "name": "Go Ben",
    "hex": "726D4E"
  },
  {
    "name": "Raven",
    "hex": "727B89"
  },
  {
    "name": "Seance",
    "hex": "731E8F"
  },
  {
    "name": "Raw Umber",
    "hex": "734A12"
  },
  {
    "name": "Kimberly",
    "hex": "736C9F"
  },
  {
    "name": "Crocodile",
    "hex": "736D58"
  },
  {
    "name": "Crete",
    "hex": "737829"
  },
  {
    "name": "Xanadu",
    "hex": "738678"
  },
  {
    "name": "Spicy Mustard",
    "hex": "74640D"
  },
  {
    "name": "Limed Ash",
    "hex": "747D63"
  },
  {
    "name": "Rolling Stone",
    "hex": "747D83"
  },
  {
    "name": "Blue Smoke",
    "hex": "748881"
  },
  {
    "name": "Laurel",
    "hex": "749378"
  },
  {
    "name": "Mantis",
    "hex": "74C365"
  },
  {
    "name": "Russett",
    "hex": "755A57"
  },
  {
    "name": "Deluge",
    "hex": "7563A8"
  },
  {
    "name": "Cosmic",
    "hex": "76395D"
  },
  {
    "name": "Blue Marguerite",
    "hex": "7666C6"
  },
  {
    "name": "Lima",
    "hex": "76BD17"
  },
  {
    "name": "Sky Blue",
    "hex": "76D7EA"
  },
  {
    "name": "Dark Burgundy",
    "hex": "770F05"
  },
  {
    "name": "Crown of Thorns",
    "hex": "771F1F"
  },
  {
    "name": "Walnut",
    "hex": "773F1A"
  },
  {
    "name": "Pablo",
    "hex": "776F61"
  },
  {
    "name": "Pacifika",
    "hex": "778120"
  },
  {
    "name": "Oxley",
    "hex": "779E86"
  },
  {
    "name": "Pastel Green",
    "hex": "77DD77"
  },
  {
    "name": "Japanese Maple",
    "hex": "780109"
  },
  {
    "name": "Mocha",
    "hex": "782D19"
  },
  {
    "name": "Peanut",
    "hex": "782F16"
  },
  {
    "name": "Camouflage Green",
    "hex": "78866B"
  },
  {
    "name": "Wasabi",
    "hex": "788A25"
  },
  {
    "name": "Ship Cove",
    "hex": "788BBA"
  },
  {
    "name": "Sea Nymph",
    "hex": "78A39C"
  },
  {
    "name": "Roman Coffee",
    "hex": "795D4C"
  },
  {
    "name": "Old Lavender",
    "hex": "796878"
  },
  {
    "name": "Rum",
    "hex": "796989"
  },
  {
    "name": "Fedora",
    "hex": "796A78"
  },
  {
    "name": "Sandstone",
    "hex": "796D62"
  },
  {
    "name": "Spray",
    "hex": "79DEEC"
  },
  {
    "name": "Siren",
    "hex": "7A013A"
  },
  {
    "name": "Fuchsia Blue",
    "hex": "7A58C1"
  },
  {
    "name": "Boulder",
    "hex": "7A7A7A"
  },
  {
    "name": "Wild Blue Yonder",
    "hex": "7A89B8"
  },
  {
    "name": "De York",
    "hex": "7AC488"
  },
  {
    "name": "Red Beech",
    "hex": "7B3801"
  },
  {
    "name": "Cinnamon",
    "hex": "7B3F00"
  },
  {
    "name": "Yukon Gold",
    "hex": "7B6608"
  },
  {
    "name": "Tapa",
    "hex": "7B7874"
  },
  {
    "name": "Waterloo ",
    "hex": "7B7C94"
  },
  {
    "name": "Flax Smoke",
    "hex": "7B8265"
  },
  {
    "name": "Amulet",
    "hex": "7B9F80"
  },
  {
    "name": "Asparagus",
    "hex": "7BA05B"
  },
  {
    "name": "Kenyan Copper",
    "hex": "7C1C05"
  },
  {
    "name": "Pesto",
    "hex": "7C7631"
  },
  {
    "name": "Topaz",
    "hex": "7C778A"
  },
  {
    "name": "Concord",
    "hex": "7C7B7A"
  },
  {
    "name": "Jumbo",
    "hex": "7C7B82"
  },
  {
    "name": "Trendy Green",
    "hex": "7C881A"
  },
  {
    "name": "Gumbo",
    "hex": "7CA1A6"
  },
  {
    "name": "Acapulco",
    "hex": "7CB0A1"
  },
  {
    "name": "Neptune",
    "hex": "7CB7BB"
  },
  {
    "name": "Pueblo",
    "hex": "7D2C14"
  },
  {
    "name": "Bay Leaf",
    "hex": "7DA98D"
  },
  {
    "name": "Malibu",
    "hex": "7DC8F7"
  },
  {
    "name": "Bermuda",
    "hex": "7DD8C6"
  },
  {
    "name": "Copper Canyon",
    "hex": "7E3A15"
  },
  {
    "name": "Claret",
    "hex": "7F1734"
  },
  {
    "name": "Peru Tan",
    "hex": "7F3A02"
  },
  {
    "name": "Falcon",
    "hex": "7F626D"
  },
  {
    "name": "Mobster",
    "hex": "7F7589"
  },
  {
    "name": "Moody Blue",
    "hex": "7F76D3"
  },
  {
    "name": "Chartreuse",
    "hex": "7FFF00"
  },
  {
    "name": "Aquamarine",
    "hex": "7FFFD4"
  },
  {
    "name": "Maroon",
    "hex": "800000"
  },
  {
    "name": "Rose Bud Cherry",
    "hex": "800B47"
  },
  {
    "name": "Falu Red",
    "hex": "801818"
  },
  {
    "name": "Red Robin",
    "hex": "80341F"
  },
  {
    "name": "Vivid Violet",
    "hex": "803790"
  },
  {
    "name": "Russet",
    "hex": "80461B"
  },
  {
    "name": "Friar Gray",
    "hex": "807E79"
  },
  {
    "name": "Olive",
    "hex": "808000"
  },
  {
    "name": "Gray",
    "hex": "808080"
  },
  {
    "name": "Gulf Stream",
    "hex": "80B3AE"
  },
  {
    "name": "Glacier",
    "hex": "80B3C4"
  },
  {
    "name": "Seagull",
    "hex": "80CCEA"
  },
  {
    "name": "Nutmeg",
    "hex": "81422C"
  },
  {
    "name": "Spicy Pink",
    "hex": "816E71"
  },
  {
    "name": "Empress",
    "hex": "817377"
  },
  {
    "name": "Spanish Green",
    "hex": "819885"
  },
  {
    "name": "Sand Dune",
    "hex": "826F65"
  },
  {
    "name": "Gunsmoke",
    "hex": "828685"
  },
  {
    "name": "Battleship Gray",
    "hex": "828F72"
  },
  {
    "name": "Merlot",
    "hex": "831923"
  },
  {
    "name": "Shadow",
    "hex": "837050"
  },
  {
    "name": "Chelsea Cucumber",
    "hex": "83AA5D"
  },
  {
    "name": "Monte Carlo",
    "hex": "83D0C6"
  },
  {
    "name": "Plum",
    "hex": "843179"
  },
  {
    "name": "Granny Smith",
    "hex": "84A0A0"
  },
  {
    "name": "Chetwode Blue",
    "hex": "8581D9"
  },
  {
    "name": "Bandicoot",
    "hex": "858470"
  },
  {
    "name": "Bali Hai",
    "hex": "859FAF"
  },
  {
    "name": "Half Baked",
    "hex": "85C4CC"
  },
  {
    "name": "Red Devil",
    "hex": "860111"
  },
  {
    "name": "Lotus",
    "hex": "863C3C"
  },
  {
    "name": "Ironstone",
    "hex": "86483C"
  },
  {
    "name": "Bull Shot",
    "hex": "864D1E"
  },
  {
    "name": "Rusty Nail",
    "hex": "86560A"
  },
  {
    "name": "Bitter",
    "hex": "868974"
  },
  {
    "name": "Regent Gray",
    "hex": "86949F"
  },
  {
    "name": "Disco",
    "hex": "871550"
  },
  {
    "name": "Americano",
    "hex": "87756E"
  },
  {
    "name": "Hurricane",
    "hex": "877C7B"
  },
  {
    "name": "Oslo Gray",
    "hex": "878D91"
  },
  {
    "name": "Sushi",
    "hex": "87AB39"
  },
  {
    "name": "Spicy Mix",
    "hex": "885342"
  },
  {
    "name": "Kumera",
    "hex": "886221"
  },
  {
    "name": "Suva Gray",
    "hex": "888387"
  },
  {
    "name": "Avocado",
    "hex": "888D65"
  },
  {
    "name": "Camelot",
    "hex": "893456"
  },
  {
    "name": "Solid Pink",
    "hex": "893843"
  },
  {
    "name": "Cannon Pink",
    "hex": "894367"
  },
  {
    "name": "Makara",
    "hex": "897D6D"
  },
  {
    "name": "Burnt Umber",
    "hex": "8A3324"
  },
  {
    "name": "True V",
    "hex": "8A73D6"
  },
  {
    "name": "Clay Creek",
    "hex": "8A8360"
  },
  {
    "name": "Monsoon",
    "hex": "8A8389"
  },
  {
    "name": "Stack",
    "hex": "8A8F8A"
  },
  {
    "name": "Jordy Blue",
    "hex": "8AB9F1"
  },
  {
    "name": "Electric Violet",
    "hex": "8B00FF"
  },
  {
    "name": "Monarch",
    "hex": "8B0723"
  },
  {
    "name": "Corn Harvest",
    "hex": "8B6B0B"
  },
  {
    "name": "Olive Haze",
    "hex": "8B8470"
  },
  {
    "name": "Schooner",
    "hex": "8B847E"
  },
  {
    "name": "Natural Gray",
    "hex": "8B8680"
  },
  {
    "name": "Mantle",
    "hex": "8B9C90"
  },
  {
    "name": "Portage",
    "hex": "8B9FEE"
  },
  {
    "name": "Envy",
    "hex": "8BA690"
  },
  {
    "name": "Cascade",
    "hex": "8BA9A5"
  },
  {
    "name": "Riptide",
    "hex": "8BE6D8"
  },
  {
    "name": "Cardinal Pink",
    "hex": "8C055E"
  },
  {
    "name": "Mule Fawn",
    "hex": "8C472F"
  },
  {
    "name": "Potters Clay",
    "hex": "8C5738"
  },
  {
    "name": "Trendy Pink",
    "hex": "8C6495"
  },
  {
    "name": "Paprika",
    "hex": "8D0226"
  },
  {
    "name": "Sanguine Brown",
    "hex": "8D3D38"
  },
  {
    "name": "Tosca",
    "hex": "8D3F3F"
  },
  {
    "name": "Cement",
    "hex": "8D7662"
  },
  {
    "name": "Granite Green",
    "hex": "8D8974"
  },
  {
    "name": "Manatee",
    "hex": "8D90A1"
  },
  {
    "name": "Polo Blue",
    "hex": "8DA8CC"
  },
  {
    "name": "Red Berry",
    "hex": "8E0000"
  },
  {
    "name": "Rope",
    "hex": "8E4D1E"
  },
  {
    "name": "Opium",
    "hex": "8E6F70"
  },
  {
    "name": "Domino",
    "hex": "8E775E"
  },
  {
    "name": "Mamba",
    "hex": "8E8190"
  },
  {
    "name": "Nepal",
    "hex": "8EABC1"
  },
  {
    "name": "Pohutukawa",
    "hex": "8F021C"
  },
  {
    "name": "El Salva",
    "hex": "8F3E33"
  },
  {
    "name": "Korma",
    "hex": "8F4B0E"
  },
  {
    "name": "Squirrel",
    "hex": "8F8176"
  },
  {
    "name": "Vista Blue",
    "hex": "8FD6B4"
  },
  {
    "name": "Burgundy",
    "hex": "900020"
  },
  {
    "name": "Old Brick",
    "hex": "901E1E"
  },
  {
    "name": "Hemp",
    "hex": "907874"
  },
  {
    "name": "Almond Frost",
    "hex": "907B71"
  },
  {
    "name": "Sycamore",
    "hex": "908D39"
  },
  {
    "name": "Sangria",
    "hex": "92000A"
  },
  {
    "name": "Cumin",
    "hex": "924321"
  },
  {
    "name": "Beaver",
    "hex": "926F5B"
  },
  {
    "name": "Stonewall",
    "hex": "928573"
  },
  {
    "name": "Venus",
    "hex": "928590"
  },
  {
    "name": "Medium Purple",
    "hex": "9370DB"
  },
  {
    "name": "Cornflower",
    "hex": "93CCEA"
  },
  {
    "name": "Algae Green",
    "hex": "93DFB8"
  },
  {
    "name": "Copper Rust",
    "hex": "944747"
  },
  {
    "name": "Arrowtown",
    "hex": "948771"
  },
  {
    "name": "Scarlett",
    "hex": "950015"
  },
  {
    "name": "Strikemaster",
    "hex": "956387"
  },
  {
    "name": "Mountain Mist",
    "hex": "959396"
  },
  {
    "name": "Carmine",
    "hex": "960018"
  },
  {
    "name": "Brown",
    "hex": "964B00"
  },
  {
    "name": "Leather",
    "hex": "967059"
  },
  {
    "name": "Purple Mountain's Majesty",
    "hex": "9678B6"
  },
  {
    "name": "Lavender Purple",
    "hex": "967BB6"
  },
  {
    "name": "Pewter",
    "hex": "96A8A1"
  },
  {
    "name": "Summer Green",
    "hex": "96BBAB"
  },
  {
    "name": "Au Chico",
    "hex": "97605D"
  },
  {
    "name": "Wisteria",
    "hex": "9771B5"
  },
  {
    "name": "Atlantis",
    "hex": "97CD2D"
  },
  {
    "name": "Vin Rouge",
    "hex": "983D61"
  },
  {
    "name": "Lilac Bush",
    "hex": "9874D3"
  },
  {
    "name": "Bazaar",
    "hex": "98777B"
  },
  {
    "name": "Hacienda",
    "hex": "98811B"
  },
  {
    "name": "Pale Oyster",
    "hex": "988D77"
  },
  {
    "name": "Mint Green",
    "hex": "98FF98"
  },
  {
    "name": "Fresh Eggplant",
    "hex": "990066"
  },
  {
    "name": "Violet Eggplant",
    "hex": "991199"
  },
  {
    "name": "Tamarillo",
    "hex": "991613"
  },
  {
    "name": "Totem Pole",
    "hex": "991B07"
  },
  {
    "name": "Copper Rose",
    "hex": "996666"
  },
  {
    "name": "Amethyst",
    "hex": "9966CC"
  },
  {
    "name": "Mountbatten Pink",
    "hex": "997A8D"
  },
  {
    "name": "Blue Bell",
    "hex": "9999CC"
  },
  {
    "name": "Prairie Sand",
    "hex": "9A3820"
  },
  {
    "name": "Toast",
    "hex": "9A6E61"
  },
  {
    "name": "Gurkha",
    "hex": "9A9577"
  },
  {
    "name": "Olivine",
    "hex": "9AB973"
  },
  {
    "name": "Shadow Green",
    "hex": "9AC2B8"
  },
  {
    "name": "Oregon",
    "hex": "9B4703"
  },
  {
    "name": "Lemon Grass",
    "hex": "9B9E8F"
  },
  {
    "name": "Stiletto",
    "hex": "9C3336"
  },
  {
    "name": "Hawaiian Tan",
    "hex": "9D5616"
  },
  {
    "name": "Gull Gray",
    "hex": "9DACB7"
  },
  {
    "name": "Pistachio",
    "hex": "9DC209"
  },
  {
    "name": "Granny Smith Apple",
    "hex": "9DE093"
  },
  {
    "name": "Anakiwa",
    "hex": "9DE5FF"
  },
  {
    "name": "Chelsea Gem",
    "hex": "9E5302"
  },
  {
    "name": "Sepia Skin",
    "hex": "9E5B40"
  },
  {
    "name": "Sage",
    "hex": "9EA587"
  },
  {
    "name": "Citron",
    "hex": "9EA91F"
  },
  {
    "name": "Rock Blue",
    "hex": "9EB1CD"
  },
  {
    "name": "Morning Glory",
    "hex": "9EDEE0"
  },
  {
    "name": "Cognac",
    "hex": "9F381D"
  },
  {
    "name": "Reef Gold",
    "hex": "9F821C"
  },
  {
    "name": "Star Dust",
    "hex": "9F9F9C"
  },
  {
    "name": "Santas Gray",
    "hex": "9FA0B1"
  },
  {
    "name": "Sinbad",
    "hex": "9FD7D3"
  },
  {
    "name": "Feijoa",
    "hex": "9FDD8C"
  },
  {
    "name": "Tabasco",
    "hex": "A02712"
  },
  {
    "name": "Buttered Rum",
    "hex": "A1750D"
  },
  {
    "name": "Hit Gray",
    "hex": "A1ADB5"
  },
  {
    "name": "Citrus",
    "hex": "A1C50A"
  },
  {
    "name": "Aqua Island",
    "hex": "A1DAD7"
  },
  {
    "name": "Water Leaf",
    "hex": "A1E9DE"
  },
  {
    "name": "Flirt",
    "hex": "A2006D"
  },
  {
    "name": "Rouge",
    "hex": "A23B6C"
  },
  {
    "name": "Cape Palliser",
    "hex": "A26645"
  },
  {
    "name": "Gray Chateau",
    "hex": "A2AAB3"
  },
  {
    "name": "Edward",
    "hex": "A2AEAB"
  },
  {
    "name": "Pharlap",
    "hex": "A3807B"
  },
  {
    "name": "Amethyst Smoke",
    "hex": "A397B4"
  },
  {
    "name": "Blizzard Blue",
    "hex": "A3E3ED"
  },
  {
    "name": "Delta",
    "hex": "A4A49D"
  },
  {
    "name": "Wistful",
    "hex": "A4A6D3"
  },
  {
    "name": "Green Smoke",
    "hex": "A4AF6E"
  },
  {
    "name": "Jazzberry Jam",
    "hex": "A50B5E"
  },
  {
    "name": "Zorba",
    "hex": "A59B91"
  },
  {
    "name": "Bahia",
    "hex": "A5CB0C"
  },
  {
    "name": "Roof Terracotta",
    "hex": "A62F20"
  },
  {
    "name": "Paarl",
    "hex": "A65529"
  },
  {
    "name": "Barley Corn",
    "hex": "A68B5B"
  },
  {
    "name": "Donkey Brown",
    "hex": "A69279"
  },
  {
    "name": "Dawn",
    "hex": "A6A29A"
  },
  {
    "name": "Mexican Red",
    "hex": "A72525"
  },
  {
    "name": "Luxor Gold",
    "hex": "A7882C"
  },
  {
    "name": "Rich Gold",
    "hex": "A85307"
  },
  {
    "name": "Reno Sand",
    "hex": "A86515"
  },
  {
    "name": "Coral Tree",
    "hex": "A86B6B"
  },
  {
    "name": "Dusty Gray",
    "hex": "A8989B"
  },
  {
    "name": "Dull Lavender",
    "hex": "A899E6"
  },
  {
    "name": "Tallow",
    "hex": "A8A589"
  },
  {
    "name": "Bud",
    "hex": "A8AE9C"
  },
  {
    "name": "Locust",
    "hex": "A8AF8E"
  },
  {
    "name": "Norway",
    "hex": "A8BD9F"
  },
  {
    "name": "Chinook",
    "hex": "A8E3BD"
  },
  {
    "name": "Gray Olive",
    "hex": "A9A491"
  },
  {
    "name": "Aluminium",
    "hex": "A9ACB6"
  },
  {
    "name": "Cadet Blue",
    "hex": "A9B2C3"
  },
  {
    "name": "Schist",
    "hex": "A9B497"
  },
  {
    "name": "Tower Gray",
    "hex": "A9BDBF"
  },
  {
    "name": "Perano",
    "hex": "A9BEF2"
  },
  {
    "name": "Opal",
    "hex": "A9C6C2"
  },
  {
    "name": "Night Shadz",
    "hex": "AA375A"
  },
  {
    "name": "Fire",
    "hex": "AA4203"
  },
  {
    "name": "Muesli",
    "hex": "AA8B5B"
  },
  {
    "name": "Sandal",
    "hex": "AA8D6F"
  },
  {
    "name": "Shady Lady",
    "hex": "AAA5A9"
  },
  {
    "name": "Logan",
    "hex": "AAA9CD"
  },
  {
    "name": "Spun Pearl",
    "hex": "AAABB7"
  },
  {
    "name": "Regent St Blue",
    "hex": "AAD6E6"
  },
  {
    "name": "Magic Mint",
    "hex": "AAF0D1"
  },
  {
    "name": "Lipstick",
    "hex": "AB0563"
  },
  {
    "name": "Royal Heath",
    "hex": "AB3472"
  },
  {
    "name": "Sandrift",
    "hex": "AB917A"
  },
  {
    "name": "Cold Purple",
    "hex": "ABA0D9"
  },
  {
    "name": "Bronco",
    "hex": "ABA196"
  },
  {
    "name": "Limed Oak",
    "hex": "AC8A56"
  },
  {
    "name": "East Side",
    "hex": "AC91CE"
  },
  {
    "name": "Lemon Ginger",
    "hex": "AC9E22"
  },
  {
    "name": "Napa",
    "hex": "ACA494"
  },
  {
    "name": "Hillary",
    "hex": "ACA586"
  },
  {
    "name": "Cloudy",
    "hex": "ACA59F"
  },
  {
    "name": "Silver Chalice",
    "hex": "ACACAC"
  },
  {
    "name": "Swamp Green",
    "hex": "ACB78E"
  },
  {
    "name": "Spring Rain",
    "hex": "ACCBB1"
  },
  {
    "name": "Conifer",
    "hex": "ACDD4D"
  },
  {
    "name": "Celadon",
    "hex": "ACE1AF"
  },
  {
    "name": "Mandalay",
    "hex": "AD781B"
  },
  {
    "name": "Casper",
    "hex": "ADBED1"
  },
  {
    "name": "Moss Green",
    "hex": "ADDFAD"
  },
  {
    "name": "Padua",
    "hex": "ADE6C4"
  },
  {
    "name": "Green Yellow",
    "hex": "ADFF2F"
  },
  {
    "name": "Hippie Pink",
    "hex": "AE4560"
  },
  {
    "name": "Desert",
    "hex": "AE6020"
  },
  {
    "name": "Bouquet",
    "hex": "AE809E"
  },
  {
    "name": "Medium Carmine",
    "hex": "AF4035"
  },
  {
    "name": "Apple Blossom",
    "hex": "AF4D43"
  },
  {
    "name": "Brown Rust",
    "hex": "AF593E"
  },
  {
    "name": "Driftwood",
    "hex": "AF8751"
  },
  {
    "name": "Alpine",
    "hex": "AF8F2C"
  },
  {
    "name": "Lucky",
    "hex": "AF9F1C"
  },
  {
    "name": "Martini",
    "hex": "AFA09E"
  },
  {
    "name": "Bombay",
    "hex": "AFB1B8"
  },
  {
    "name": "Pigeon Post",
    "hex": "AFBDD9"
  },
  {
    "name": "Cadillac",
    "hex": "B04C6A"
  },
  {
    "name": "Matrix",
    "hex": "B05D54"
  },
  {
    "name": "Tapestry",
    "hex": "B05E81"
  },
  {
    "name": "Mai Tai",
    "hex": "B06608"
  },
  {
    "name": "Del Rio",
    "hex": "B09A95"
  },
  {
    "name": "Powder Blue",
    "hex": "B0E0E6"
  },
  {
    "name": "Inch Worm",
    "hex": "B0E313"
  },
  {
    "name": "Bright Red",
    "hex": "B10000"
  },
  {
    "name": "Vesuvius",
    "hex": "B14A0B"
  },
  {
    "name": "Pumpkin Skin",
    "hex": "B1610B"
  },
  {
    "name": "Santa Fe",
    "hex": "B16D52"
  },
  {
    "name": "Teak",
    "hex": "B19461"
  },
  {
    "name": "Fringy Flower",
    "hex": "B1E2C1"
  },
  {
    "name": "Ice Cold",
    "hex": "B1F4E7"
  },
  {
    "name": "Shiraz",
    "hex": "B20931"
  },
  {
    "name": "Biloba Flower",
    "hex": "B2A1EA"
  },
  {
    "name": "Tall Poppy",
    "hex": "B32D29"
  },
  {
    "name": "Fiery Orange",
    "hex": "B35213"
  },
  {
    "name": "Hot Toddy",
    "hex": "B38007"
  },
  {
    "name": "Taupe Gray",
    "hex": "B3AF95"
  },
  {
    "name": "La Rioja",
    "hex": "B3C110"
  },
  {
    "name": "Well Read",
    "hex": "B43332"
  },
  {
    "name": "Blush",
    "hex": "B44668"
  },
  {
    "name": "Jungle Mist",
    "hex": "B4CFD3"
  },
  {
    "name": "Turkish Rose",
    "hex": "B57281"
  },
  {
    "name": "Lavender",
    "hex": "B57EDC"
  },
  {
    "name": "Mongoose",
    "hex": "B5A27F"
  },
  {
    "name": "Olive Green",
    "hex": "B5B35C"
  },
  {
    "name": "Jet Stream",
    "hex": "B5D2CE"
  },
  {
    "name": "Cruise",
    "hex": "B5ECDF"
  },
  {
    "name": "Hibiscus",
    "hex": "B6316C"
  },
  {
    "name": "Thatch",
    "hex": "B69D98"
  },
  {
    "name": "Heathered Gray",
    "hex": "B6B095"
  },
  {
    "name": "Eagle",
    "hex": "B6BAA4"
  },
  {
    "name": "Spindle",
    "hex": "B6D1EA"
  },
  {
    "name": "Gum Leaf",
    "hex": "B6D3BF"
  },
  {
    "name": "Rust",
    "hex": "B7410E"
  },
  {
    "name": "Muddy Waters",
    "hex": "B78E5C"
  },
  {
    "name": "Sahara",
    "hex": "B7A214"
  },
  {
    "name": "Husk",
    "hex": "B7A458"
  },
  {
    "name": "Nobel",
    "hex": "B7B1B1"
  },
  {
    "name": "Heather",
    "hex": "B7C3D0"
  },
  {
    "name": "Madang",
    "hex": "B7F0BE"
  },
  {
    "name": "Milano Red",
    "hex": "B81104"
  },
  {
    "name": "Copper",
    "hex": "B87333"
  },
  {
    "name": "Gimblet",
    "hex": "B8B56A"
  },
  {
    "name": "Green Spring",
    "hex": "B8C1B1"
  },
  {
    "name": "Celery",
    "hex": "B8C25D"
  },
  {
    "name": "Sail",
    "hex": "B8E0F9"
  },
  {
    "name": "Chestnut",
    "hex": "B94E48"
  },
  {
    "name": "Crail",
    "hex": "B95140"
  },
  {
    "name": "Marigold",
    "hex": "B98D28"
  },
  {
    "name": "Wild Willow",
    "hex": "B9C46A"
  },
  {
    "name": "Rainee",
    "hex": "B9C8AC"
  },
  {
    "name": "Guardsman Red",
    "hex": "BA0101"
  },
  {
    "name": "Rock Spray",
    "hex": "BA450C"
  },
  {
    "name": "Bourbon",
    "hex": "BA6F1E"
  },
  {
    "name": "Pirate Gold",
    "hex": "BA7F03"
  },
  {
    "name": "Nomad",
    "hex": "BAB1A2"
  },
  {
    "name": "Submarine",
    "hex": "BAC7C9"
  },
  {
    "name": "Charlotte",
    "hex": "BAEEF9"
  },
  {
    "name": "Medium Red Violet",
    "hex": "BB3385"
  },
  {
    "name": "Brandy Rose",
    "hex": "BB8983"
  },
  {
    "name": "Rio Grande",
    "hex": "BBD009"
  },
  {
    "name": "Surf",
    "hex": "BBD7C1"
  },
  {
    "name": "Powder Ash",
    "hex": "BCC9C2"
  },
  {
    "name": "Tuscany",
    "hex": "BD5E2E"
  },
  {
    "name": "Quicksand",
    "hex": "BD978E"
  },
  {
    "name": "Silk",
    "hex": "BDB1A8"
  },
  {
    "name": "Malta",
    "hex": "BDB2A1"
  },
  {
    "name": "Chatelle",
    "hex": "BDB3C7"
  },
  {
    "name": "Lavender Gray",
    "hex": "BDBBD7"
  },
  {
    "name": "French Gray",
    "hex": "BDBDC6"
  },
  {
    "name": "Clay Ash",
    "hex": "BDC8B3"
  },
  {
    "name": "Loblolly",
    "hex": "BDC9CE"
  },
  {
    "name": "French Pass",
    "hex": "BDEDFD"
  },
  {
    "name": "London Hue",
    "hex": "BEA6C3"
  },
  {
    "name": "Pink Swan",
    "hex": "BEB5B7"
  },
  {
    "name": "Fuego",
    "hex": "BEDE0D"
  },
  {
    "name": "Rose of Sharon",
    "hex": "BF5500"
  },
  {
    "name": "Tide",
    "hex": "BFB8B0"
  },
  {
    "name": "Blue Haze",
    "hex": "BFBED8"
  },
  {
    "name": "Silver Sand",
    "hex": "BFC1C2"
  },
  {
    "name": "Key Lime Pie",
    "hex": "BFC921"
  },
  {
    "name": "Ziggurat",
    "hex": "BFDBE2"
  },
  {
    "name": "Lime",
    "hex": "BFFF00"
  },
  {
    "name": "Thunderbird",
    "hex": "C02B18"
  },
  {
    "name": "Mojo",
    "hex": "C04737"
  },
  {
    "name": "Old Rose",
    "hex": "C08081"
  },
  {
    "name": "Silver",
    "hex": "C0C0C0"
  },
  {
    "name": "Pale Leaf",
    "hex": "C0D3B9"
  },
  {
    "name": "Pixie Green",
    "hex": "C0D8B6"
  },
  {
    "name": "Tia Maria",
    "hex": "C1440E"
  },
  {
    "name": "Fuchsia Pink",
    "hex": "C154C1"
  },
  {
    "name": "Buddha Gold",
    "hex": "C1A004"
  },
  {
    "name": "Bison Hide",
    "hex": "C1B7A4"
  },
  {
    "name": "Tea",
    "hex": "C1BAB0"
  },
  {
    "name": "Gray Suit",
    "hex": "C1BECD"
  },
  {
    "name": "Sprout",
    "hex": "C1D7B0"
  },
  {
    "name": "Sulu",
    "hex": "C1F07C"
  },
  {
    "name": "Indochine",
    "hex": "C26B03"
  },
  {
    "name": "Twine",
    "hex": "C2955D"
  },
  {
    "name": "Cotton Seed",
    "hex": "C2BDB6"
  },
  {
    "name": "Pumice",
    "hex": "C2CAC4"
  },
  {
    "name": "Jagged Ice",
    "hex": "C2E8E5"
  },
  {
    "name": "Maroon Flush",
    "hex": "C32148"
  },
  {
    "name": "Indian Khaki",
    "hex": "C3B091"
  },
  {
    "name": "Pale Slate",
    "hex": "C3BFC1"
  },
  {
    "name": "Gray Nickel",
    "hex": "C3C3BD"
  },
  {
    "name": "Periwinkle Gray",
    "hex": "C3CDE6"
  },
  {
    "name": "Tiara",
    "hex": "C3D1D1"
  },
  {
    "name": "Tropical Blue",
    "hex": "C3DDF9"
  },
  {
    "name": "Cardinal",
    "hex": "C41E3A"
  },
  {
    "name": "Fuzzy Wuzzy Brown",
    "hex": "C45655"
  },
  {
    "name": "Orange Roughy",
    "hex": "C45719"
  },
  {
    "name": "Mist Gray",
    "hex": "C4C4BC"
  },
  {
    "name": "Coriander",
    "hex": "C4D0B0"
  },
  {
    "name": "Mint Tulip",
    "hex": "C4F4EB"
  },
  {
    "name": "Mulberry",
    "hex": "C54B8C"
  },
  {
    "name": "Nugget",
    "hex": "C59922"
  },
  {
    "name": "Tussock",
    "hex": "C5994B"
  },
  {
    "name": "Sea Mist",
    "hex": "C5DBCA"
  },
  {
    "name": "Yellow Green",
    "hex": "C5E17A"
  },
  {
    "name": "Brick Red",
    "hex": "C62D42"
  },
  {
    "name": "Contessa",
    "hex": "C6726B"
  },
  {
    "name": "Oriental Pink",
    "hex": "C69191"
  },
  {
    "name": "Roti",
    "hex": "C6A84B"
  },
  {
    "name": "Ash",
    "hex": "C6C3B5"
  },
  {
    "name": "Kangaroo",
    "hex": "C6C8BD"
  },
  {
    "name": "Las Palmas",
    "hex": "C6E610"
  },
  {
    "name": "Monza",
    "hex": "C7031E"
  },
  {
    "name": "Red Violet",
    "hex": "C71585"
  },
  {
    "name": "Coral Reef",
    "hex": "C7BCA2"
  },
  {
    "name": "Melrose",
    "hex": "C7C1FF"
  },
  {
    "name": "Cloud",
    "hex": "C7C4BF"
  },
  {
    "name": "Ghost",
    "hex": "C7C9D5"
  },
  {
    "name": "Pine Glade",
    "hex": "C7CD90"
  },
  {
    "name": "Botticelli",
    "hex": "C7DDE5"
  },
  {
    "name": "Antique Brass",
    "hex": "C88A65"
  },
  {
    "name": "Lilac",
    "hex": "C8A2C8"
  },
  {
    "name": "Hokey Pokey",
    "hex": "C8A528"
  },
  {
    "name": "Lily",
    "hex": "C8AABF"
  },
  {
    "name": "Laser",
    "hex": "C8B568"
  },
  {
    "name": "Edgewater",
    "hex": "C8E3D7"
  },
  {
    "name": "Piper",
    "hex": "C96323"
  },
  {
    "name": "Pizza",
    "hex": "C99415"
  },
  {
    "name": "Light Wisteria",
    "hex": "C9A0DC"
  },
  {
    "name": "Rodeo Dust",
    "hex": "C9B29B"
  },
  {
    "name": "Sundance",
    "hex": "C9B35B"
  },
  {
    "name": "Earls Green",
    "hex": "C9B93B"
  },
  {
    "name": "Silver Rust",
    "hex": "C9C0BB"
  },
  {
    "name": "Conch",
    "hex": "C9D9D2"
  },
  {
    "name": "Reef",
    "hex": "C9FFA2"
  },
  {
    "name": "Aero Blue",
    "hex": "C9FFE5"
  },
  {
    "name": "Flush Mahogany",
    "hex": "CA3435"
  },
  {
    "name": "Turmeric",
    "hex": "CABB48"
  },
  {
    "name": "Paris White",
    "hex": "CADCD4"
  },
  {
    "name": "Bitter Lemon",
    "hex": "CAE00D"
  },
  {
    "name": "Skeptic",
    "hex": "CAE6DA"
  },
  {
    "name": "Viola",
    "hex": "CB8FA9"
  },
  {
    "name": "Foggy Gray",
    "hex": "CBCAB6"
  },
  {
    "name": "Green Mist",
    "hex": "CBD3B0"
  },
  {
    "name": "Nebula",
    "hex": "CBDBD6"
  },
  {
    "name": "Persian Red",
    "hex": "CC3333"
  },
  {
    "name": "Burnt Orange",
    "hex": "CC5500"
  },
  {
    "name": "Ochre",
    "hex": "CC7722"
  },
  {
    "name": "Puce",
    "hex": "CC8899"
  },
  {
    "name": "Thistle Green",
    "hex": "CCCAA8"
  },
  {
    "name": "Periwinkle",
    "hex": "CCCCFF"
  },
  {
    "name": "Electric Lime",
    "hex": "CCFF00"
  },
  {
    "name": "Tenn",
    "hex": "CD5700"
  },
  {
    "name": "Chestnut Rose",
    "hex": "CD5C5C"
  },
  {
    "name": "Brandy Punch",
    "hex": "CD8429"
  },
  {
    "name": "Onahau",
    "hex": "CDF4FF"
  },
  {
    "name": "Sorrell Brown",
    "hex": "CEB98F"
  },
  {
    "name": "Cold Turkey",
    "hex": "CEBABA"
  },
  {
    "name": "Yuma",
    "hex": "CEC291"
  },
  {
    "name": "Chino",
    "hex": "CEC7A7"
  },
  {
    "name": "Eunry",
    "hex": "CFA39D"
  },
  {
    "name": "Old Gold",
    "hex": "CFB53B"
  },
  {
    "name": "Tasman",
    "hex": "CFDCCF"
  },
  {
    "name": "Surf Crest",
    "hex": "CFE5D2"
  },
  {
    "name": "Humming Bird",
    "hex": "CFF9F3"
  },
  {
    "name": "Scandal",
    "hex": "CFFAF4"
  },
  {
    "name": "Red Stage",
    "hex": "D05F04"
  },
  {
    "name": "Hopbush",
    "hex": "D06DA1"
  },
  {
    "name": "Meteor",
    "hex": "D07D12"
  },
  {
    "name": "Perfume",
    "hex": "D0BEF8"
  },
  {
    "name": "Prelude",
    "hex": "D0C0E5"
  },
  {
    "name": "Tea Green",
    "hex": "D0F0C0"
  },
  {
    "name": "Geebung",
    "hex": "D18F1B"
  },
  {
    "name": "Vanilla",
    "hex": "D1BEA8"
  },
  {
    "name": "Soft Amber",
    "hex": "D1C6B4"
  },
  {
    "name": "Celeste",
    "hex": "D1D2CA"
  },
  {
    "name": "Mischka",
    "hex": "D1D2DD"
  },
  {
    "name": "Pear",
    "hex": "D1E231"
  },
  {
    "name": "Hot Cinnamon",
    "hex": "D2691E"
  },
  {
    "name": "Raw Sienna",
    "hex": "D27D46"
  },
  {
    "name": "Careys Pink",
    "hex": "D29EAA"
  },
  {
    "name": "Tan",
    "hex": "D2B48C"
  },
  {
    "name": "Deco",
    "hex": "D2DA97"
  },
  {
    "name": "Blue Romance",
    "hex": "D2F6DE"
  },
  {
    "name": "Gossip",
    "hex": "D2F8B0"
  },
  {
    "name": "Sisal",
    "hex": "D3CBBA"
  },
  {
    "name": "Swirl",
    "hex": "D3CDC5"
  },
  {
    "name": "Charm",
    "hex": "D47494"
  },
  {
    "name": "Clam Shell",
    "hex": "D4B6AF"
  },
  {
    "name": "Straw",
    "hex": "D4BF8D"
  },
  {
    "name": "Akaroa",
    "hex": "D4C4A8"
  },
  {
    "name": "Bird Flower",
    "hex": "D4CD16"
  },
  {
    "name": "Iron",
    "hex": "D4D7D9"
  },
  {
    "name": "Geyser",
    "hex": "D4DFE2"
  },
  {
    "name": "Hawkes Blue",
    "hex": "D4E2FC"
  },
  {
    "name": "Grenadier",
    "hex": "D54600"
  },
  {
    "name": "Can Can",
    "hex": "D591A4"
  },
  {
    "name": "Whiskey",
    "hex": "D59A6F"
  },
  {
    "name": "Winter Hazel",
    "hex": "D5D195"
  },
  {
    "name": "Granny Apple",
    "hex": "D5F6E3"
  },
  {
    "name": "My Pink",
    "hex": "D69188"
  },
  {
    "name": "Tacha",
    "hex": "D6C562"
  },
  {
    "name": "Moon Raker",
    "hex": "D6CEF6"
  },
  {
    "name": "Quill Gray",
    "hex": "D6D6D1"
  },
  {
    "name": "Snowy Mint",
    "hex": "D6FFDB"
  },
  {
    "name": "New York Pink",
    "hex": "D7837F"
  },
  {
    "name": "Pavlova",
    "hex": "D7C498"
  },
  {
    "name": "Fog",
    "hex": "D7D0FF"
  },
  {
    "name": "Valencia",
    "hex": "D84437"
  },
  {
    "name": "Japonica",
    "hex": "D87C63"
  },
  {
    "name": "Thistle",
    "hex": "D8BFD8"
  },
  {
    "name": "Maverick",
    "hex": "D8C2D5"
  },
  {
    "name": "Foam",
    "hex": "D8FCFA"
  },
  {
    "name": "Cabaret",
    "hex": "D94972"
  },
  {
    "name": "Burning Sand",
    "hex": "D99376"
  },
  {
    "name": "Cameo",
    "hex": "D9B99B"
  },
  {
    "name": "Timberwolf",
    "hex": "D9D6CF"
  },
  {
    "name": "Tana",
    "hex": "D9DCC1"
  },
  {
    "name": "Link Water",
    "hex": "D9E4F5"
  },
  {
    "name": "Mabel",
    "hex": "D9F7FF"
  },
  {
    "name": "Cerise",
    "hex": "DA3287"
  },
  {
    "name": "Flame Pea",
    "hex": "DA5B38"
  },
  {
    "name": "Bamboo",
    "hex": "DA6304"
  },
  {
    "name": "Red Damask",
    "hex": "DA6A41"
  },
  {
    "name": "Orchid",
    "hex": "DA70D6"
  },
  {
    "name": "Copperfield",
    "hex": "DA8A67"
  },
  {
    "name": "Golden Grass",
    "hex": "DAA520"
  },
  {
    "name": "Zanah",
    "hex": "DAECD6"
  },
  {
    "name": "Iceberg",
    "hex": "DAF4F0"
  },
  {
    "name": "Oyster Bay",
    "hex": "DAFAFF"
  },
  {
    "name": "Cranberry",
    "hex": "DB5079"
  },
  {
    "name": "Petite Orchid",
    "hex": "DB9690"
  },
  {
    "name": "Di Serria",
    "hex": "DB995E"
  },
  {
    "name": "Alto",
    "hex": "DBDBDB"
  },
  {
    "name": "Frosted Mint",
    "hex": "DBFFF8"
  },
  {
    "name": "Crimson",
    "hex": "DC143C"
  },
  {
    "name": "Punch",
    "hex": "DC4333"
  },
  {
    "name": "Galliano",
    "hex": "DCB20C"
  },
  {
    "name": "Blossom",
    "hex": "DCB4BC"
  },
  {
    "name": "Wattle",
    "hex": "DCD747"
  },
  {
    "name": "Westar",
    "hex": "DCD9D2"
  },
  {
    "name": "Moon Mist",
    "hex": "DCDDCC"
  },
  {
    "name": "Caper",
    "hex": "DCEDB4"
  },
  {
    "name": "Swans Down",
    "hex": "DCF0EA"
  },
  {
    "name": "Swiss Coffee",
    "hex": "DDD6D5"
  },
  {
    "name": "White Ice",
    "hex": "DDF9F1"
  },
  {
    "name": "Cerise Red",
    "hex": "DE3163"
  },
  {
    "name": "Roman",
    "hex": "DE6360"
  },
  {
    "name": "Tumbleweed",
    "hex": "DEA681"
  },
  {
    "name": "Gold Tips",
    "hex": "DEBA13"
  },
  {
    "name": "Brandy",
    "hex": "DEC196"
  },
  {
    "name": "Wafer",
    "hex": "DECBC6"
  },
  {
    "name": "Sapling",
    "hex": "DED4A4"
  },
  {
    "name": "Barberry",
    "hex": "DED717"
  },
  {
    "name": "Beryl Green",
    "hex": "DEE5C0"
  },
  {
    "name": "Pattens Blue",
    "hex": "DEF5FF"
  },
  {
    "name": "Heliotrope",
    "hex": "DF73FF"
  },
  {
    "name": "Apache",
    "hex": "DFBE6F"
  },
  {
    "name": "Chenin",
    "hex": "DFCD6F"
  },
  {
    "name": "Lola",
    "hex": "DFCFDB"
  },
  {
    "name": "Willow Brook",
    "hex": "DFECDA"
  },
  {
    "name": "Chartreuse Yellow",
    "hex": "DFFF00"
  },
  {
    "name": "Mauve",
    "hex": "E0B0FF"
  },
  {
    "name": "Anzac",
    "hex": "E0B646"
  },
  {
    "name": "Harvest Gold",
    "hex": "E0B974"
  },
  {
    "name": "Calico",
    "hex": "E0C095"
  },
  {
    "name": "Baby Blue",
    "hex": "E0FFFF"
  },
  {
    "name": "Sunglo",
    "hex": "E16865"
  },
  {
    "name": "Equator",
    "hex": "E1BC64"
  },
  {
    "name": "Pink Flare",
    "hex": "E1C0C8"
  },
  {
    "name": "Periglacial Blue",
    "hex": "E1E6D6"
  },
  {
    "name": "Kidnapper",
    "hex": "E1EAD4"
  },
  {
    "name": "Tara",
    "hex": "E1F6E8"
  },
  {
    "name": "Mandy",
    "hex": "E25465"
  },
  {
    "name": "Terracotta",
    "hex": "E2725B"
  },
  {
    "name": "Golden Bell",
    "hex": "E28913"
  },
  {
    "name": "Shocking",
    "hex": "E292C0"
  },
  {
    "name": "Dixie",
    "hex": "E29418"
  },
  {
    "name": "Light Orchid",
    "hex": "E29CD2"
  },
  {
    "name": "Snuff",
    "hex": "E2D8ED"
  },
  {
    "name": "Mystic",
    "hex": "E2EBED"
  },
  {
    "name": "Apple Green",
    "hex": "E2F3EC"
  },
  {
    "name": "Razzmatazz",
    "hex": "E30B5C"
  },
  {
    "name": "Alizarin Crimson",
    "hex": "E32636"
  },
  {
    "name": "Cinnabar",
    "hex": "E34234"
  },
  {
    "name": "Cavern Pink",
    "hex": "E3BEBE"
  },
  {
    "name": "Peppermint",
    "hex": "E3F5E1"
  },
  {
    "name": "Mindaro",
    "hex": "E3F988"
  },
  {
    "name": "Deep Blush",
    "hex": "E47698"
  },
  {
    "name": "Gamboge",
    "hex": "E49B0F"
  },
  {
    "name": "Melanie",
    "hex": "E4C2D5"
  },
  {
    "name": "Twilight",
    "hex": "E4CFDE"
  },
  {
    "name": "Bone",
    "hex": "E4D1C0"
  },
  {
    "name": "Sunflower",
    "hex": "E4D422"
  },
  {
    "name": "Grain Brown",
    "hex": "E4D5B7"
  },
  {
    "name": "Zombie",
    "hex": "E4D69B"
  },
  {
    "name": "Frostee",
    "hex": "E4F6E7"
  },
  {
    "name": "Snow Flurry",
    "hex": "E4FFD1"
  },
  {
    "name": "Amaranth",
    "hex": "E52B50"
  },
  {
    "name": "Zest",
    "hex": "E5841B"
  },
  {
    "name": "Dust Storm",
    "hex": "E5CCC9"
  },
  {
    "name": "Stark White",
    "hex": "E5D7BD"
  },
  {
    "name": "Hampton",
    "hex": "E5D8AF"
  },
  {
    "name": "Bon Jour",
    "hex": "E5E0E1"
  },
  {
    "name": "Mercury",
    "hex": "E5E5E5"
  },
  {
    "name": "Polar",
    "hex": "E5F9F6"
  },
  {
    "name": "Trinidad",
    "hex": "E64E03"
  },
  {
    "name": "Gold Sand",
    "hex": "E6BE8A"
  },
  {
    "name": "Cashmere",
    "hex": "E6BEA5"
  },
  {
    "name": "Double Spanish White",
    "hex": "E6D7B9"
  },
  {
    "name": "Satin Linen",
    "hex": "E6E4D4"
  },
  {
    "name": "Harp",
    "hex": "E6F2EA"
  },
  {
    "name": "Off Green",
    "hex": "E6F8F3"
  },
  {
    "name": "Hint of Green",
    "hex": "E6FFE9"
  },
  {
    "name": "Tranquil",
    "hex": "E6FFFF"
  },
  {
    "name": "Mango Tango",
    "hex": "E77200"
  },
  {
    "name": "Christine",
    "hex": "E7730A"
  },
  {
    "name": "Tonys Pink",
    "hex": "E79F8C"
  },
  {
    "name": "Kobi",
    "hex": "E79FC4"
  },
  {
    "name": "Rose Fog",
    "hex": "E7BCB4"
  },
  {
    "name": "Corn",
    "hex": "E7BF05"
  },
  {
    "name": "Putty",
    "hex": "E7CD8C"
  },
  {
    "name": "Gray Nurse",
    "hex": "E7ECE6"
  },
  {
    "name": "Lily White",
    "hex": "E7F8FF"
  },
  {
    "name": "Bubbles",
    "hex": "E7FEFF"
  },
  {
    "name": "Fire Bush",
    "hex": "E89928"
  },
  {
    "name": "Shilo",
    "hex": "E8B9B3"
  },
  {
    "name": "Pearl Bush",
    "hex": "E8E0D5"
  },
  {
    "name": "Green White",
    "hex": "E8EBE0"
  },
  {
    "name": "Chrome White",
    "hex": "E8F1D4"
  },
  {
    "name": "Gin",
    "hex": "E8F2EB"
  },
  {
    "name": "Aqua Squeeze",
    "hex": "E8F5F2"
  },
  {
    "name": "Clementine",
    "hex": "E96E00"
  },
  {
    "name": "Burnt Sienna",
    "hex": "E97451"
  },
  {
    "name": "Tahiti Gold",
    "hex": "E97C07"
  },
  {
    "name": "Oyster Pink",
    "hex": "E9CECD"
  },
  {
    "name": "Confetti",
    "hex": "E9D75A"
  },
  {
    "name": "Ebb",
    "hex": "E9E3E3"
  },
  {
    "name": "Ottoman",
    "hex": "E9F8ED"
  },
  {
    "name": "Clear Day",
    "hex": "E9FFFD"
  },
  {
    "name": "Carissma",
    "hex": "EA88A8"
  },
  {
    "name": "Porsche",
    "hex": "EAAE69"
  },
  {
    "name": "Tulip Tree",
    "hex": "EAB33B"
  },
  {
    "name": "Rob Roy",
    "hex": "EAC674"
  },
  {
    "name": "Raffia",
    "hex": "EADAB8"
  },
  {
    "name": "White Rock",
    "hex": "EAE8D4"
  },
  {
    "name": "Panache",
    "hex": "EAF6EE"
  },
  {
    "name": "Solitude",
    "hex": "EAF6FF"
  },
  {
    "name": "Aqua Spring",
    "hex": "EAF9F5"
  },
  {
    "name": "Dew",
    "hex": "EAFFFE"
  },
  {
    "name": "Apricot",
    "hex": "EB9373"
  },
  {
    "name": "Zinnwaldite",
    "hex": "EBC2AF"
  },
  {
    "name": "Fuel Yellow",
    "hex": "ECA927"
  },
  {
    "name": "Ronchi",
    "hex": "ECC54E"
  },
  {
    "name": "French Lilac",
    "hex": "ECC7EE"
  },
  {
    "name": "Just Right",
    "hex": "ECCDB9"
  },
  {
    "name": "Wild Rice",
    "hex": "ECE090"
  },
  {
    "name": "Fall Green",
    "hex": "ECEBBD"
  },
  {
    "name": "Aths Special",
    "hex": "ECEBCE"
  },
  {
    "name": "Starship",
    "hex": "ECF245"
  },
  {
    "name": "Red Ribbon",
    "hex": "ED0A3F"
  },
  {
    "name": "Tango",
    "hex": "ED7A1C"
  },
  {
    "name": "Carrot Orange",
    "hex": "ED9121"
  },
  {
    "name": "Sea Pink",
    "hex": "ED989E"
  },
  {
    "name": "Tacao",
    "hex": "EDB381"
  },
  {
    "name": "Desert Sand",
    "hex": "EDC9AF"
  },
  {
    "name": "Pancho",
    "hex": "EDCDAB"
  },
  {
    "name": "Chamois",
    "hex": "EDDCB1"
  },
  {
    "name": "Primrose",
    "hex": "EDEA99"
  },
  {
    "name": "Frost",
    "hex": "EDF5DD"
  },
  {
    "name": "Aqua Haze",
    "hex": "EDF5F5"
  },
  {
    "name": "Zumthor",
    "hex": "EDF6FF"
  },
  {
    "name": "Narvik",
    "hex": "EDF9F1"
  },
  {
    "name": "Honeysuckle",
    "hex": "EDFC84"
  },
  {
    "name": "Lavender Magenta",
    "hex": "EE82EE"
  },
  {
    "name": "Beauty Bush",
    "hex": "EEC1BE"
  },
  {
    "name": "Chalky",
    "hex": "EED794"
  },
  {
    "name": "Almond",
    "hex": "EED9C4"
  },
  {
    "name": "Flax",
    "hex": "EEDC82"
  },
  {
    "name": "Bizarre",
    "hex": "EEDEDA"
  },
  {
    "name": "Double Colonial White",
    "hex": "EEE3AD"
  },
  {
    "name": "Cararra",
    "hex": "EEEEE8"
  },
  {
    "name": "Manz",
    "hex": "EEEF78"
  },
  {
    "name": "Tahuna Sands",
    "hex": "EEF0C8"
  },
  {
    "name": "Athens Gray",
    "hex": "EEF0F3"
  },
  {
    "name": "Tusk",
    "hex": "EEF3C3"
  },
  {
    "name": "Loafer",
    "hex": "EEF4DE"
  },
  {
    "name": "Catskill White",
    "hex": "EEF6F7"
  },
  {
    "name": "Twilight Blue",
    "hex": "EEFDFF"
  },
  {
    "name": "Jonquil",
    "hex": "EEFF9A"
  },
  {
    "name": "Rice Flower",
    "hex": "EEFFE2"
  },
  {
    "name": "Jaffa",
    "hex": "EF863F"
  },
  {
    "name": "Gallery",
    "hex": "EFEFEF"
  },
  {
    "name": "Porcelain",
    "hex": "EFF2F3"
  },
  {
    "name": "Mauvelous",
    "hex": "F091A9"
  },
  {
    "name": "Golden Dream",
    "hex": "F0D52D"
  },
  {
    "name": "Golden Sand",
    "hex": "F0DB7D"
  },
  {
    "name": "Buff",
    "hex": "F0DC82"
  },
  {
    "name": "Prim",
    "hex": "F0E2EC"
  },
  {
    "name": "Khaki",
    "hex": "F0E68C"
  },
  {
    "name": "Selago",
    "hex": "F0EEFD"
  },
  {
    "name": "Titan White",
    "hex": "F0EEFF"
  },
  {
    "name": "Alice Blue",
    "hex": "F0F8FF"
  },
  {
    "name": "Feta",
    "hex": "F0FCEA"
  },
  {
    "name": "Gold Drop",
    "hex": "F18200"
  },
  {
    "name": "Wewak",
    "hex": "F19BAB"
  },
  {
    "name": "Sahara Sand",
    "hex": "F1E788"
  },
  {
    "name": "Parchment",
    "hex": "F1E9D2"
  },
  {
    "name": "Blue Chalk",
    "hex": "F1E9FF"
  },
  {
    "name": "Mint Julep",
    "hex": "F1EEC1"
  },
  {
    "name": "Seashell",
    "hex": "F1F1F1"
  },
  {
    "name": "Saltpan",
    "hex": "F1F7F2"
  },
  {
    "name": "Tidal",
    "hex": "F1FFAD"
  },
  {
    "name": "Chiffon",
    "hex": "F1FFC8"
  },
  {
    "name": "Flamingo",
    "hex": "F2552A"
  },
  {
    "name": "Tangerine",
    "hex": "F28500"
  },
  {
    "name": "Mandys Pink",
    "hex": "F2C3B2"
  },
  {
    "name": "Concrete",
    "hex": "F2F2F2"
  },
  {
    "name": "Black Squeeze",
    "hex": "F2FAFA"
  },
  {
    "name": "Pomegranate",
    "hex": "F34723"
  },
  {
    "name": "Buttercup",
    "hex": "F3AD16"
  },
  {
    "name": "New Orleans",
    "hex": "F3D69D"
  },
  {
    "name": "Vanilla Ice",
    "hex": "F3D9DF"
  },
  {
    "name": "Sidecar",
    "hex": "F3E7BB"
  },
  {
    "name": "Dawn Pink",
    "hex": "F3E9E5"
  },
  {
    "name": "Wheatfield",
    "hex": "F3EDCF"
  },
  {
    "name": "Canary",
    "hex": "F3FB62"
  },
  {
    "name": "Orinoco",
    "hex": "F3FBD4"
  },
  {
    "name": "Carla",
    "hex": "F3FFD8"
  },
  {
    "name": "Hollywood Cerise",
    "hex": "F400A1"
  },
  {
    "name": "Sandy brown",
    "hex": "F4A460"
  },
  {
    "name": "Saffron",
    "hex": "F4C430"
  },
  {
    "name": "Ripe Lemon",
    "hex": "F4D81C"
  },
  {
    "name": "Janna",
    "hex": "F4EBD3"
  },
  {
    "name": "Pampas",
    "hex": "F4F2EE"
  },
  {
    "name": "Wild Sand",
    "hex": "F4F4F4"
  },
  {
    "name": "Zircon",
    "hex": "F4F8FF"
  },
  {
    "name": "Froly",
    "hex": "F57584"
  },
  {
    "name": "Cream Can",
    "hex": "F5C85C"
  },
  {
    "name": "Manhattan",
    "hex": "F5C999"
  },
  {
    "name": "Maize",
    "hex": "F5D5A0"
  },
  {
    "name": "Wheat",
    "hex": "F5DEB3"
  },
  {
    "name": "Sandwisp",
    "hex": "F5E7A2"
  },
  {
    "name": "Pot Pourri",
    "hex": "F5E7E2"
  },
  {
    "name": "Albescent White",
    "hex": "F5E9D3"
  },
  {
    "name": "Soft Peach",
    "hex": "F5EDEF"
  },
  {
    "name": "Ecru White",
    "hex": "F5F3E5"
  },
  {
    "name": "Beige",
    "hex": "F5F5DC"
  },
  {
    "name": "Golden Fizz",
    "hex": "F5FB3D"
  },
  {
    "name": "Australian Mint",
    "hex": "F5FFBE"
  },
  {
    "name": "French Rose",
    "hex": "F64A8A"
  },
  {
    "name": "Brilliant Rose",
    "hex": "F653A6"
  },
  {
    "name": "Illusion",
    "hex": "F6A4C9"
  },
  {
    "name": "Merino",
    "hex": "F6F0E6"
  },
  {
    "name": "Black Haze",
    "hex": "F6F7F7"
  },
  {
    "name": "Spring Sun",
    "hex": "F6FFDC"
  },
  {
    "name": "Violet Red",
    "hex": "F7468A"
  },
  {
    "name": "Chilean Fire",
    "hex": "F77703"
  },
  {
    "name": "Persian Pink",
    "hex": "F77FBE"
  },
  {
    "name": "Rajah",
    "hex": "F7B668"
  },
  {
    "name": "Azalea",
    "hex": "F7C8DA"
  },
  {
    "name": "We Peep",
    "hex": "F7DBE6"
  },
  {
    "name": "Quarter Spanish White",
    "hex": "F7F2E1"
  },
  {
    "name": "Whisper",
    "hex": "F7F5FA"
  },
  {
    "name": "Snow Drift",
    "hex": "F7FAF7"
  },
  {
    "name": "Casablanca",
    "hex": "F8B853"
  },
  {
    "name": "Chantilly",
    "hex": "F8C3DF"
  },
  {
    "name": "Cherub",
    "hex": "F8D9E9"
  },
  {
    "name": "Marzipan",
    "hex": "F8DB9D"
  },
  {
    "name": "Energy Yellow",
    "hex": "F8DD5C"
  },
  {
    "name": "Givry",
    "hex": "F8E4BF"
  },
  {
    "name": "White Linen",
    "hex": "F8F0E8"
  },
  {
    "name": "Magnolia",
    "hex": "F8F4FF"
  },
  {
    "name": "Spring Wood",
    "hex": "F8F6F1"
  },
  {
    "name": "Coconut Cream",
    "hex": "F8F7DC"
  },
  {
    "name": "White Lilac",
    "hex": "F8F7FC"
  },
  {
    "name": "Desert Storm",
    "hex": "F8F8F7"
  },
  {
    "name": "Texas",
    "hex": "F8F99C"
  },
  {
    "name": "Corn Field",
    "hex": "F8FACD"
  },
  {
    "name": "Mimosa",
    "hex": "F8FDD3"
  },
  {
    "name": "Carnation",
    "hex": "F95A61"
  },
  {
    "name": "Saffron Mango",
    "hex": "F9BF58"
  },
  {
    "name": "Carousel Pink",
    "hex": "F9E0ED"
  },
  {
    "name": "Dairy Cream",
    "hex": "F9E4BC"
  },
  {
    "name": "Portica",
    "hex": "F9E663"
  },
  {
    "name": "Amour",
    "hex": "F9EAF3"
  },
  {
    "name": "Rum Swizzle",
    "hex": "F9F8E4"
  },
  {
    "name": "Dolly",
    "hex": "F9FF8B"
  },
  {
    "name": "Sugar Cane",
    "hex": "F9FFF6"
  },
  {
    "name": "Ecstasy",
    "hex": "FA7814"
  },
  {
    "name": "Tan Hide",
    "hex": "FA9D5A"
  },
  {
    "name": "Corvette",
    "hex": "FAD3A2"
  },
  {
    "name": "Peach Yellow",
    "hex": "FADFAD"
  },
  {
    "name": "Turbo",
    "hex": "FAE600"
  },
  {
    "name": "Astra",
    "hex": "FAEAB9"
  },
  {
    "name": "Champagne",
    "hex": "FAECCC"
  },
  {
    "name": "Linen",
    "hex": "FAF0E6"
  },
  {
    "name": "Fantasy",
    "hex": "FAF3F0"
  },
  {
    "name": "Citrine White",
    "hex": "FAF7D6"
  },
  {
    "name": "Alabaster",
    "hex": "FAFAFA"
  },
  {
    "name": "Hint of Yellow",
    "hex": "FAFDE4"
  },
  {
    "name": "Milan",
    "hex": "FAFFA4"
  },
  {
    "name": "Brink Pink",
    "hex": "FB607F"
  },
  {
    "name": "Geraldine",
    "hex": "FB8989"
  },
  {
    "name": "Lavender Rose",
    "hex": "FBA0E3"
  },
  {
    "name": "Sea Buckthorn",
    "hex": "FBA129"
  },
  {
    "name": "Sun",
    "hex": "FBAC13"
  },
  {
    "name": "Lavender Pink",
    "hex": "FBAED2"
  },
  {
    "name": "Rose Bud",
    "hex": "FBB2A3"
  },
  {
    "name": "Cupid",
    "hex": "FBBEDA"
  },
  {
    "name": "Classic Rose",
    "hex": "FBCCE7"
  },
  {
    "name": "Apricot Peach",
    "hex": "FBCEB1"
  },
  {
    "name": "Banana Mania",
    "hex": "FBE7B2"
  },
  {
    "name": "Marigold Yellow",
    "hex": "FBE870"
  },
  {
    "name": "Festival",
    "hex": "FBE96C"
  },
  {
    "name": "Sweet Corn",
    "hex": "FBEA8C"
  },
  {
    "name": "Candy Corn",
    "hex": "FBEC5D"
  },
  {
    "name": "Hint of Red",
    "hex": "FBF9F9"
  },
  {
    "name": "Shalimar",
    "hex": "FBFFBA"
  },
  {
    "name": "Shocking Pink",
    "hex": "FC0FC0"
  },
  {
    "name": "Tickle Me Pink",
    "hex": "FC80A5"
  },
  {
    "name": "Tree Poppy",
    "hex": "FC9C1D"
  },
  {
    "name": "Lightning Yellow",
    "hex": "FCC01E"
  },
  {
    "name": "Goldenrod",
    "hex": "FCD667"
  },
  {
    "name": "Candlelight",
    "hex": "FCD917"
  },
  {
    "name": "Cherokee",
    "hex": "FCDA98"
  },
  {
    "name": "Double Pearl Lusta",
    "hex": "FCF4D0"
  },
  {
    "name": "Pearl Lusta",
    "hex": "FCF4DC"
  },
  {
    "name": "Vista White",
    "hex": "FCF8F7"
  },
  {
    "name": "Bianca",
    "hex": "FCFBF3"
  },
  {
    "name": "Moon Glow",
    "hex": "FCFEDA"
  },
  {
    "name": "China Ivory",
    "hex": "FCFFE7"
  },
  {
    "name": "Ceramic",
    "hex": "FCFFF9"
  },
  {
    "name": "Torch Red",
    "hex": "FD0E35"
  },
  {
    "name": "Wild Watermelon",
    "hex": "FD5B78"
  },
  {
    "name": "Crusta",
    "hex": "FD7B33"
  },
  {
    "name": "Sorbus",
    "hex": "FD7C07"
  },
  {
    "name": "Sweet Pink",
    "hex": "FD9FA2"
  },
  {
    "name": "Light Apricot",
    "hex": "FDD5B1"
  },
  {
    "name": "Pig Pink",
    "hex": "FDD7E4"
  },
  {
    "name": "Cinderella",
    "hex": "FDE1DC"
  },
  {
    "name": "Golden Glow",
    "hex": "FDE295"
  },
  {
    "name": "Lemon",
    "hex": "FDE910"
  },
  {
    "name": "Old Lace",
    "hex": "FDF5E6"
  },
  {
    "name": "Half Colonial White",
    "hex": "FDF6D3"
  },
  {
    "name": "Drover",
    "hex": "FDF7AD"
  },
  {
    "name": "Pale Prim",
    "hex": "FDFEB8"
  },
  {
    "name": "Cumulus",
    "hex": "FDFFD5"
  },
  {
    "name": "Persian Rose",
    "hex": "FE28A2"
  },
  {
    "name": "Sunset Orange",
    "hex": "FE4C40"
  },
  {
    "name": "Bittersweet",
    "hex": "FE6F5E"
  },
  {
    "name": "California",
    "hex": "FE9D04"
  },
  {
    "name": "Yellow Sea",
    "hex": "FEA904"
  },
  {
    "name": "Melon",
    "hex": "FEBAAD"
  },
  {
    "name": "Bright Sun",
    "hex": "FED33C"
  },
  {
    "name": "Dandelion",
    "hex": "FED85D"
  },
  {
    "name": "Salomie",
    "hex": "FEDB8D"
  },
  {
    "name": "Cape Honey",
    "hex": "FEE5AC"
  },
  {
    "name": "Remy",
    "hex": "FEEBF3"
  },
  {
    "name": "Oasis",
    "hex": "FEEFCE"
  },
  {
    "name": "Bridesmaid",
    "hex": "FEF0EC"
  },
  {
    "name": "Beeswax",
    "hex": "FEF2C7"
  },
  {
    "name": "Bleach White",
    "hex": "FEF3D8"
  },
  {
    "name": "Pipi",
    "hex": "FEF4CC"
  },
  {
    "name": "Half Spanish White",
    "hex": "FEF4DB"
  },
  {
    "name": "Wisp Pink",
    "hex": "FEF4F8"
  },
  {
    "name": "Provincial Pink",
    "hex": "FEF5F1"
  },
  {
    "name": "Half Dutch White",
    "hex": "FEF7DE"
  },
  {
    "name": "Solitaire",
    "hex": "FEF8E2"
  },
  {
    "name": "White Pointer",
    "hex": "FEF8FF"
  },
  {
    "name": "Off Yellow",
    "hex": "FEF9E3"
  },
  {
    "name": "Orange White",
    "hex": "FEFCED"
  },
  {
    "name": "Red",
    "hex": "FF0000"
  },
  {
    "name": "Rose",
    "hex": "FF007F"
  },
  {
    "name": "Purple Pizzazz",
    "hex": "FF00CC"
  },
  {
    "name": "Magenta / Fuchsia",
    "hex": "FF00FF"
  },
  {
    "name": "Scarlet",
    "hex": "FF2400"
  },
  {
    "name": "Wild Strawberry",
    "hex": "FF3399"
  },
  {
    "name": "Razzle Dazzle Rose",
    "hex": "FF33CC"
  },
  {
    "name": "Radical Red",
    "hex": "FF355E"
  },
  {
    "name": "Red Orange",
    "hex": "FF3F34"
  },
  {
    "name": "Coral Red",
    "hex": "FF4040"
  },
  {
    "name": "Vermilion",
    "hex": "FF4D00"
  },
  {
    "name": "International Orange",
    "hex": "FF4F00"
  },
  {
    "name": "Outrageous Orange",
    "hex": "FF6037"
  },
  {
    "name": "Blaze Orange",
    "hex": "FF6600"
  },
  {
    "name": "Pink Flamingo",
    "hex": "FF66FF"
  },
  {
    "name": "Orange",
    "hex": "FF681F"
  },
  {
    "name": "Hot Pink",
    "hex": "FF69B4"
  },
  {
    "name": "Persimmon",
    "hex": "FF6B53"
  },
  {
    "name": "Blush Pink",
    "hex": "FF6FFF"
  },
  {
    "name": "Burning Orange",
    "hex": "FF7034"
  },
  {
    "name": "Pumpkin",
    "hex": "FF7518"
  },
  {
    "name": "Flamenco",
    "hex": "FF7D07"
  },
  {
    "name": "Flush Orange",
    "hex": "FF7F00"
  },
  {
    "name": "Coral",
    "hex": "FF7F50"
  },
  {
    "name": "Salmon",
    "hex": "FF8C69"
  },
  {
    "name": "Pizazz",
    "hex": "FF9000"
  },
  {
    "name": "West Side",
    "hex": "FF910F"
  },
  {
    "name": "Pink Salmon",
    "hex": "FF91A4"
  },
  {
    "name": "Neon Carrot",
    "hex": "FF9933"
  },
  {
    "name": "Atomic Tangerine",
    "hex": "FF9966"
  },
  {
    "name": "Vivid Tangerine",
    "hex": "FF9980"
  },
  {
    "name": "Sunshade",
    "hex": "FF9E2C"
  },
  {
    "name": "Orange Peel",
    "hex": "FFA000"
  },
  {
    "name": "Mona Lisa",
    "hex": "FFA194"
  },
  {
    "name": "Web Orange",
    "hex": "FFA500"
  },
  {
    "name": "Carnation Pink",
    "hex": "FFA6C9"
  },
  {
    "name": "Hit Pink",
    "hex": "FFAB81"
  },
  {
    "name": "Yellow Orange",
    "hex": "FFAE42"
  },
  {
    "name": "Cornflower Lilac",
    "hex": "FFB0AC"
  },
  {
    "name": "Sundown",
    "hex": "FFB1B3"
  },
  {
    "name": "My Sin",
    "hex": "FFB31F"
  },
  {
    "name": "Texas Rose",
    "hex": "FFB555"
  },
  {
    "name": "Cotton Candy",
    "hex": "FFB7D5"
  },
  {
    "name": "Macaroni and Cheese",
    "hex": "FFB97B"
  },
  {
    "name": "Selective Yellow",
    "hex": "FFBA00"
  },
  {
    "name": "Koromiko",
    "hex": "FFBD5F"
  },
  {
    "name": "Amber",
    "hex": "FFBF00"
  },
  {
    "name": "Wax Flower",
    "hex": "FFC0A8"
  },
  {
    "name": "Pink",
    "hex": "FFC0CB"
  },
  {
    "name": "Your Pink",
    "hex": "FFC3C0"
  },
  {
    "name": "Supernova",
    "hex": "FFC901"
  },
  {
    "name": "Flesh",
    "hex": "FFCBA4"
  },
  {
    "name": "Sunglow",
    "hex": "FFCC33"
  },
  {
    "name": "Golden Tainoi",
    "hex": "FFCC5C"
  },
  {
    "name": "Peach Orange",
    "hex": "FFCC99"
  },
  {
    "name": "Chardonnay",
    "hex": "FFCD8C"
  },
  {
    "name": "Pastel Pink",
    "hex": "FFD1DC"
  },
  {
    "name": "Romantic",
    "hex": "FFD2B7"
  },
  {
    "name": "Grandis",
    "hex": "FFD38C"
  },
  {
    "name": "Gold",
    "hex": "FFD700"
  },
  {
    "name": "School bus Yellow",
    "hex": "FFD800"
  },
  {
    "name": "Cosmos",
    "hex": "FFD8D9"
  },
  {
    "name": "Mustard",
    "hex": "FFDB58"
  },
  {
    "name": "Peach Schnapps",
    "hex": "FFDCD6"
  },
  {
    "name": "Caramel",
    "hex": "FFDDAF"
  },
  {
    "name": "Tuft Bush",
    "hex": "FFDDCD"
  },
  {
    "name": "Watusi",
    "hex": "FFDDCF"
  },
  {
    "name": "Pink Lace",
    "hex": "FFDDF4"
  },
  {
    "name": "Navajo White",
    "hex": "FFDEAD"
  },
  {
    "name": "Frangipani",
    "hex": "FFDEB3"
  },
  {
    "name": "Pippin",
    "hex": "FFE1DF"
  },
  {
    "name": "Pale Rose",
    "hex": "FFE1F2"
  },
  {
    "name": "Negroni",
    "hex": "FFE2C5"
  },
  {
    "name": "Cream Brulee",
    "hex": "FFE5A0"
  },
  {
    "name": "Peach",
    "hex": "FFE5B4"
  },
  {
    "name": "Tequila",
    "hex": "FFE6C7"
  },
  {
    "name": "Kournikova",
    "hex": "FFE772"
  },
  {
    "name": "Sandy Beach",
    "hex": "FFEAC8"
  },
  {
    "name": "Karry",
    "hex": "FFEAD4"
  },
  {
    "name": "Broom",
    "hex": "FFEC13"
  },
  {
    "name": "Colonial White",
    "hex": "FFEDBC"
  },
  {
    "name": "Derby",
    "hex": "FFEED8"
  },
  {
    "name": "Vis Vis",
    "hex": "FFEFA1"
  },
  {
    "name": "Egg White",
    "hex": "FFEFC1"
  },
  {
    "name": "Papaya Whip",
    "hex": "FFEFD5"
  },
  {
    "name": "Fair Pink",
    "hex": "FFEFEC"
  },
  {
    "name": "Peach Cream",
    "hex": "FFF0DB"
  },
  {
    "name": "Lavender blush",
    "hex": "FFF0F5"
  },
  {
    "name": "Gorse",
    "hex": "FFF14F"
  },
  {
    "name": "Buttermilk",
    "hex": "FFF1B5"
  },
  {
    "name": "Pink Lady",
    "hex": "FFF1D8"
  },
  {
    "name": "Forget Me Not",
    "hex": "FFF1EE"
  },
  {
    "name": "Tutu",
    "hex": "FFF1F9"
  },
  {
    "name": "Picasso",
    "hex": "FFF39D"
  },
  {
    "name": "Chardon",
    "hex": "FFF3F1"
  },
  {
    "name": "Paris Daisy",
    "hex": "FFF46E"
  },
  {
    "name": "Barley White",
    "hex": "FFF4CE"
  },
  {
    "name": "Egg Sour",
    "hex": "FFF4DD"
  },
  {
    "name": "Sazerac",
    "hex": "FFF4E0"
  },
  {
    "name": "Serenade",
    "hex": "FFF4E8"
  },
  {
    "name": "Chablis",
    "hex": "FFF4F3"
  },
  {
    "name": "Seashell Peach",
    "hex": "FFF5EE"
  },
  {
    "name": "Sauvignon",
    "hex": "FFF5F3"
  },
  {
    "name": "Milk Punch",
    "hex": "FFF6D4"
  },
  {
    "name": "Varden",
    "hex": "FFF6DF"
  },
  {
    "name": "Rose White",
    "hex": "FFF6F5"
  },
  {
    "name": "Baja White",
    "hex": "FFF8D1"
  },
  {
    "name": "Gin Fizz",
    "hex": "FFF9E2"
  },
  {
    "name": "Early Dawn",
    "hex": "FFF9E6"
  },
  {
    "name": "Lemon Chiffon",
    "hex": "FFFACD"
  },
  {
    "name": "Bridal Heath",
    "hex": "FFFAF4"
  },
  {
    "name": "Scotch Mist",
    "hex": "FFFBDC"
  },
  {
    "name": "Soapstone",
    "hex": "FFFBF9"
  },
  {
    "name": "Witch Haze",
    "hex": "FFFC99"
  },
  {
    "name": "Buttery White",
    "hex": "FFFCEA"
  },
  {
    "name": "Island Spice",
    "hex": "FFFCEE"
  },
  {
    "name": "Cream",
    "hex": "FFFDD0"
  },
  {
    "name": "Chilean Heath",
    "hex": "FFFDE6"
  },
  {
    "name": "Travertine",
    "hex": "FFFDE8"
  },
  {
    "name": "Orchid White",
    "hex": "FFFDF3"
  },
  {
    "name": "Quarter Pearl Lusta",
    "hex": "FFFDF4"
  },
  {
    "name": "Half and Half",
    "hex": "FFFEE1"
  },
  {
    "name": "Apricot White",
    "hex": "FFFEEC"
  },
  {
    "name": "Rice Cake",
    "hex": "FFFEF0"
  },
  {
    "name": "Black White",
    "hex": "FFFEF6"
  },
  {
    "name": "Romance",
    "hex": "FFFEFD"
  },
  {
    "name": "Yellow",
    "hex": "FFFF00"
  },
  {
    "name": "Laser Lemon",
    "hex": "FFFF66"
  },
  {
    "name": "Pale Canary",
    "hex": "FFFF99"
  },
  {
    "name": "Portafino",
    "hex": "FFFFB4"
  },
  {
    "name": "Ivory",
    "hex": "FFFFF0"
  },
  {
    "name": "White",
    "hex": "FFFFFF"
  }
]
export default ntcColours;
