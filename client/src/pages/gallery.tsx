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
import img22 from "@assets/FB_IMG_1690475906365_1764946176019.jpg";
import img23 from "@assets/FB_IMG_1690475918283_1764946176020.jpg";
import img24 from "@assets/FB_IMG_1690476018127_1764946176022.jpg";
import img25 from "@assets/FB_IMG_1690476022548_1764946176024.jpg";
import img26 from "@assets/FB_IMG_1690476036804_1764946176026.jpg";
import img27 from "@assets/FB_IMG_1690476052514_1764946176027.jpg";
import img28 from "@assets/FB_IMG_1690476059980_1764946176028.jpg";
import img29 from "@assets/FB_IMG_1690476073966_1764946176032.jpg";
import img30 from "@assets/FB_IMG_1690476081035_1764946176034.jpg";
import img31 from "@assets/IMG_20210129_122216_02_1764946176041.jpg";
import img32 from "@assets/IMG_20220810_125649554_HDR_1758501643329.jpg";
import img33 from "@assets/IMG_20220818_061221927_HDR_1758501643284.jpg";
import img34 from "@assets/IMG_20220819_100006041_HDR_1758501643389.jpg";
import img35 from "@assets/IMG_20220822_145153062_1758501643379.jpg";
import img36 from "@assets/IMG_20220822_172039397_1758501643356.jpg";
import img37 from "@assets/IMG_20220919_091701403_HDR_1758497194325.jpg";
import img38 from "@assets/IMG_20220919_093840705_HDR_1758501643298.jpg";
import img39 from "@assets/IMG_20220927_142557035_HDR_1758501643363.jpg";
import img40 from "@assets/IMG_20221001_085145137_HDR_1758501643396.jpg";
import img41 from "@assets/IMG_20221116_152249626_1758501643404.jpg";
import img42 from "@assets/IMG_20230110_114439922_HDR_1758501643416.jpg";
import img43 from "@assets/IMG_20230110_115751854_HDR_1758501643370.jpg";
import img44 from "@assets/FB_IMG_1675268568106_1764946073196.jpg";
import img45 from "@assets/cartoona_1764946073194.png";
import img46 from "@assets/images_1764946176040.jpeg";
import img47 from "@assets/FB_IMG_1675268829327_1758501643307.jpg";
import img48 from "@assets/FB_IMG_5937718007297288444_1758496138704.jpg";
import img49 from "@assets/IMG_20250827_103204519_HDR_1758496567144.jpg";
import img50 from "@assets/IMG_20250920_152516884.jpg";
const allImages = [
  img1, img2, img3, img4, img5, img6, img7, img8, img9, img10,
  img11, img12, img13, img14, img15, img16, img17, img18, img19, img20,
  img21, img22, img23, img24, img25, img26, img27, img28, img29, img30,
  img31, img32, img33, img34, img35, img36, img37, img38, img39, img40,
  img41, img42, img43, img44, img45, img46, img47, img48, img49, img50,
];

const numTiles = Math.ceil(allImages.length / 4);
const tiles: string[][] = [];
for (let i = 0; i < numTiles; i++) {
  const tileImages: string[] = [];
  for (let j = 0; j < 4; j++) {
    const imgIndex = i * 4 + j;
    if (imgIndex < allImages.length) {
      tileImages.push(allImages[imgIndex]);
    } else {
      tileImages.push(allImages[imgIndex % allImages.length]);
    }
  }
  tiles.push(tileImages);
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
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Our Work Gallery
          </h1>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto">
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
          <p className="text-slate-400">
            Want to see your move featured here? Book with us today!
          </p>
          <a
            href="/services"
            className="inline-block mt-4 px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-full font-semibold hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg"
            data-testid="link-get-quote"
          >
            Get a Free Quote
          </a>
        </div>
      </main>
    </div>
  );
}
