import { useState, useEffect } from "react";
import Header from "@/components/header";

import img1 from "@assets/20201208_140539_1764946073180.jpg";
import img2 from "@assets/20210116_135907_HDR_1764946073182.jpg";
import img3 from "@assets/20210219_134320_1764946073183.jpg";
import img4 from "@assets/20210401_100524_HDR_1764946073184.jpg";
import img5 from "@assets/20210401_100531_HDR_1764946073186.jpg";
import img6 from "@assets/20210401_100538_HDR_1764946073187.jpg";
import img7 from "@assets/20211107_151109_1764946073190.jpg";
import img8 from "@assets/1549057354530_bigstock_moving_boxes_on_a_red_dolly_wi_6101608_1764946073192.jpg";
import img9 from "@assets/FB_IMG_1675268576884_1764946073198.jpg";
import img10 from "@assets/FB_IMG_1675268629678_1764946073200.jpg";
import img11 from "@assets/FB_IMG_1675268634834_1764946073201.jpg";
import img12 from "@assets/FB_IMG_1675268649119_1764946073202.jpg";
import img13 from "@assets/FB_IMG_1675268657273_1764946073204.jpg";
import img14 from "@assets/FB_IMG_1675268744026_1764946073206.jpg";
import img15 from "@assets/FB_IMG_1675268776624_1764946073208.jpg";
import img16 from "@assets/FB_IMG_1690475796515_1764946175991.jpg";
import img17 from "@assets/FB_IMG_1690475807616_1764946176008.jpg";
import img18 from "@assets/FB_IMG_1690475815655_1764946176012.jpg";
import img19 from "@assets/FB_IMG_1690475828185_1764946176014.jpg";
import img20 from "@assets/FB_IMG_1690475838624_1764946176015.jpg";
import img21 from "@assets/FB_IMG_1690475856711_1764946176016.jpg";
import img22 from "@assets/FB_IMG_1690475895979_1764946176018.jpg";
import img23 from "@assets/FB_IMG_1690475906365_1764946176019.jpg";
import img24 from "@assets/FB_IMG_1690475918283_1764946176020.jpg";
import img25 from "@assets/FB_IMG_1690476018127_1764946176022.jpg";
import img26 from "@assets/FB_IMG_1690476022548_1764946176024.jpg";
import img27 from "@assets/FB_IMG_1690476036804_1764946176026.jpg";
import img28 from "@assets/FB_IMG_1690476052514_1764946176027.jpg";
import img29 from "@assets/FB_IMG_1690476059980_1764946176028.jpg";
import img30 from "@assets/FB_IMG_1690476073966_1764946176032.jpg";
import img31 from "@assets/FB_IMG_1690476081035_1764946176034.jpg";
import img32 from "@assets/IMG_20210129_122216_02_1764946176041.jpg";
import img33 from "@assets/IMG_20210204_162140_01_1764946176042.jpg";
import img34 from "@assets/IMG_20220810_125649554_HDR_1758501643329.jpg";
import img35 from "@assets/IMG_20220818_061221927_HDR_1758501643284.jpg";
import img36 from "@assets/IMG_20220819_100006041_HDR_1758501643389.jpg";
import img37 from "@assets/IMG_20220822_145153062_1758501643379.jpg";
import img38 from "@assets/IMG_20220822_172039397_1758501643356.jpg";
import img39 from "@assets/IMG_20220919_091701403_HDR_1758497194325.jpg";
import img40 from "@assets/IMG_20220919_093840705_HDR_1758501643298.jpg";
import img41 from "@assets/IMG_20220927_142557035_HDR_1758501643363.jpg";
import img42 from "@assets/IMG_20221001_085145137_HDR_1758501643396.jpg";
import img43 from "@assets/IMG_20221116_152249626_1758501643404.jpg";
import img44 from "@assets/IMG_20230110_114439922_HDR_1758501643416.jpg";
import img45 from "@assets/IMG_20230110_115751854_HDR_1758501643370.jpg";
import img46 from "@assets/FB_IMG_1675268568106_1764946073196.jpg";
import img47 from "@assets/cartoona_1764946073194.png";
import img48 from "@assets/images_1764946176040.jpeg";
import img49 from "@assets/FB_IMG_1675268829327_1758501643307.jpg";
import img50 from "@assets/FB_IMG_5937718007297288444_1758496138704.jpg";
import img51 from "@assets/FB_IMG_1675268629678_1758501643345.jpg";
import img52 from "@assets/IMG_20250827_103204519_HDR_1758496567144.jpg";
import img53 from "@assets/IMG_20250920_152516884.jpg";
import img54 from "@assets/IMG_20251006_114650293_HDR_1759769265785.jpg";
import img55 from "@assets/received_2828844647304972_1760045063435.jpeg";
import img56 from "@assets/Messenger_creation_1330603135436130_1759800599190.jpeg";
import img57 from "@assets/Messenger_creation_1877193199896847_1759801273858.jpeg";
import img58 from "@assets/Messenger_creation_4257898181150630_1759801273881.jpeg";
import img59 from "@assets/Messenger_creation_7A0555AD-E01F-412B-A9DC-A10029854F4D_1762041515879.jpeg";
import img60 from "@assets/498611721_2465175107158144_8018114900498787982_n_1758653529430.jpg";
import img61 from "@assets/IMG_20251205_071842726_1764940776899.jpg";
import img62 from "@assets/customer_reviews.jpg";
import img63 from "@assets/FB_IMG_5937718007297288444_1758496258755.jpg";
import img64 from "@assets/FB_IMG_1675268568106_1758501643336.jpg";
import img65 from "@assets/633b402b-f228-4845-8657-43a8f174ead3_1761525803107.png";
import img66 from "@assets/image_1758652939275.png";
import img67 from "@assets/image_1761080834102.png";
import img68 from "@assets/image_1761082377778.png";
import img69 from "@assets/image_1761248606428.png";
import img70 from "@assets/image_1761249354401.png";
import img71 from "@assets/image_1761249714243.png";
import img72 from "@assets/image_1761249968167.png";
import img73 from "@assets/image_1761250015263.png";
import img74 from "@assets/image_1761256772909.png";
import img75 from "@assets/image_1761256963152.png";
import img76 from "@assets/image_1761269513236.png";
import img77 from "@assets/image_1761269596499.png";
import img78 from "@assets/image_1761269597356.png";
import img79 from "@assets/image_1761428137446.png";
import img80 from "@assets/image_1761429609814.png";
import img81 from "@assets/image_1761482148724.png";
import img82 from "@assets/image_1761483678657.png";
import img83 from "@assets/image_1761484127484.png";
import img84 from "@assets/image_1761522647765.png";
import img85 from "@assets/image_1761529708302.png";
import img86 from "@assets/image_1761576746739.png";
import img87 from "@assets/image_1761608734662.png";
import img88 from "@assets/image_1761655334540.png";
import img89 from "@assets/image_1761655392607.png";
import img90 from "@assets/image_1761656044074.png";
import img91 from "@assets/image_1761656622720.png";
import img92 from "@assets/image_1761657593696.png";
import img93 from "@assets/image_1761658022499.png";
import img94 from "@assets/image_1761660358768.png";
import img95 from "@assets/image_1761663739701.png";
import img96 from "@assets/image_1762045367305.png";
import img97 from "@assets/image_1762091776106.png";
import img98 from "@assets/image_1762187366432.png";
import img99 from "@assets/image_1764942512408.png";
import img100 from "@assets/Messenger_creation_0898D8B4-FEF4-425B-AC79-245FEB77DA14_1759694666795.png";
import img101 from "@assets/Messenger_creation_15C1C009-78C1-41FF-A056-4C77BCEF31D8_1761583867652.png";
import img102 from "@assets/Messenger_creation_515A3EC6-5F8C-4F97-9469-9AF523A2E0AF_1761583867702.png";
import img103 from "@assets/Messenger_creation_515A3EC6-5F8C-4F97-9469-9AF523A2E0AF_1761584930396.png";
import img104 from "@assets/Messenger_creation_8504B2EA-853C-4DD8-A883-F7A6540DB9CE_1759694666909.png";
import img105 from "@assets/Messenger_creation_AC487EAB-73AC-4708-A6F7-C5AEE7A7AFC7_1759360655455.png";
import img106 from "@assets/Messenger_creation_B6FAAF43-BDB9-4F09-A06C-9E8A34B55EE5_1759360655382.png";
import img107 from "@assets/Messenger_creation_BEDF9A2F-8492-4AB1-8047-5198B96F1CD2_1761583867621.png";
import img108 from "@assets/Messenger_creation_CD2E79DD-062B-4D52-BBD8-62AB41670254_1761583867677.png";
import img109 from "@assets/Messenger_creation_CD2E79DD-062B-4D52-BBD8-62AB41670254_1761584930296.png";
import img110 from "@assets/screenshot-1758993207369.png";
import img111 from "@assets/Screenshot_20250923-165633.Chrome_1758664709966.png";
import img112 from "@assets/Screenshot_20250923-171334.Chrome_1758665661145.png";
import img113 from "@assets/Screenshot_20250924-074747.Chrome_1758718100425.png";
import img114 from "@assets/Screenshot_20250924-135646.Chrome_1758740246051.png";
import img115 from "@assets/Screenshot_20250924-141016.Chrome_1758741037603.png";
import img116 from "@assets/Screenshot_20250924-144318.Chrome_1758743009542.png";
import img117 from "@assets/Screenshot_20250924-145852.Chrome_1758743945851.png";
import img118 from "@assets/Screenshot_20250924-150230.Replit_1758744605455.png";
import img119 from "@assets/Screenshot_20250924-150622.Chrome_1758744394654.png";
import img120 from "@assets/Screenshot_20250924-150622.Chrome_1758745119113.png";

const allImages = [
  img1, img2, img3, img4, img5, img6, img7, img8, img9, img10,
  img11, img12, img13, img14, img15, img16, img17, img18, img19, img20,
  img21, img22, img23, img24, img25, img26, img27, img28, img29, img30,
  img31, img32, img33, img34, img35, img36, img37, img38, img39, img40,
  img41, img42, img43, img44, img45, img46, img47, img48, img49, img50,
  img51, img52, img53, img54, img55, img56, img57, img58, img59, img60,
  img61, img62, img63, img64, img65, img66, img67, img68, img69, img70,
  img71, img72, img73, img74, img75, img76, img77, img78, img79, img80,
  img81, img82, img83, img84, img85, img86, img87, img88, img89, img90,
  img91, img92, img93, img94, img95, img96, img97, img98, img99, img100,
  img101, img102, img103, img104, img105, img106, img107, img108, img109, img110,
  img111, img112, img113, img114, img115, img116, img117, img118, img119, img120,
];

const tiles: string[][] = [];
for (let i = 0; i < 30; i++) {
  tiles.push([
    allImages[i * 4],
    allImages[i * 4 + 1],
    allImages[i * 4 + 2],
    allImages[i * 4 + 3],
  ]);
}

function GalleryTile({ images, index }: { images: string[]; index: number }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const startDelay = index * 100;
    
    const timeout = setTimeout(() => {
      const interval = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % images.length);
      }, 3000);

      return () => clearInterval(interval);
    }, startDelay);

    return () => clearTimeout(timeout);
  }, [images.length, index]);

  return (
    <div 
      className="relative aspect-square rounded-lg overflow-hidden shadow-lg bg-gray-200 dark:bg-gray-800 group cursor-pointer"
      data-testid={`gallery-tile-${index}`}
    >
      {images.map((src, imgIndex) => (
        <img
          key={imgIndex}
          src={src}
          alt={`Moving photo ${index * 4 + imgIndex + 1}`}
          loading="lazy"
          onLoad={() => imgIndex === 0 && setIsLoaded(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
            imgIndex === currentIndex ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-maroon border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 flex gap-1">
        {images.map((_, dotIndex) => (
          <div
            key={dotIndex}
            className={`w-2 h-2 rounded-full transition-all ${
              dotIndex === currentIndex 
                ? "bg-white scale-110" 
                : "bg-white/50"
            }`}
          />
        ))}
      </div>

      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
    </div>
  );
}

export default function GalleryPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Our Work Gallery
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            Take a look at our team in action! From residential moves to commercial relocations, 
            we handle every job with care and professionalism.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {tiles.map((tileImages, index) => (
            <GalleryTile key={index} images={tileImages} index={index} />
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            Want to see your move featured here? Book with us today!
          </p>
          <a
            href="/services"
            className="inline-block mt-4 px-6 py-3 bg-maroon text-white rounded-full font-semibold hover:bg-maroon/90 transition-colors"
            data-testid="link-get-quote"
          >
            Get a Free Quote
          </a>
        </div>
      </main>
    </div>
  );
}
