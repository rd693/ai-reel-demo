import { ReelData, ReelScene } from "../../data/demoReelData";
import { ReelInput } from "./reelTypes";

const IMAGES = {
  hero: "/assets/spa-hero.jpg",
  client: "/assets/spa-client.jpg",
  room: "/assets/spa-room.jpg",
  treatment: "/assets/spa-treatment.jpg",
};

const createOfferReel = (input: ReelInput): ReelScene[] => {
  return [
    {
      id: crypto.randomUUID(),
      type: "hook",
      durationInSeconds: 3,
      headline: `POV: You found the best ${input.industry} secret`,
      caption: `You won't believe this ${input.industry} hack...`,
      sticker: "WAIT FOR IT",
      backgroundUrl: IMAGES.hero,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "problem",
      durationInSeconds: 3,
      headline: `Tired of basic ${input.industry}?`,
      caption: `Tired of basic ${input.industry} results?`,
      sticker: "RELATABLE?",
      backgroundUrl: IMAGES.room,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "offer",
      durationInSeconds: 4,
      headline: input.offer,
      caption: `Exclusive Offer: ${input.offer}`,
      subText: "Today only",
      sticker: "FLASH DEAL",
      backgroundUrl: IMAGES.treatment,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "proof",
      durationInSeconds: 3,
      headline: "The results speak for themselves",
      caption: "500+ happy clients this month",
      sticker: "REAL RESULTS",
      backgroundUrl: IMAGES.client,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "cta",
      durationInSeconds: 4,
      headline: input.cta,
      caption: input.cta,
      subText: input.businessName,
      sticker: "BOOK NOW",
      backgroundUrl: IMAGES.hero,
      backgroundType: "image",
    },
  ];
};

const createBeforeAfterReel = (input: ReelInput): ReelScene[] => {
  return [
    {
      id: crypto.randomUUID(),
      type: "hook",
      durationInSeconds: 3,
      headline: "The transformation you've been waiting for",
      caption: "Wait for the end... 😱",
      sticker: "TRUST THE PROCESS",
      backgroundUrl: IMAGES.client,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "reaction",
      durationInSeconds: 3,
      headline: "Before",
      caption: `How it started... with traditional ${input.industry}`,
      sticker: "BEFORE",
      backgroundUrl: IMAGES.room,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "reaction",
      durationInSeconds: 3,
      headline: "After",
      caption: "How it's going! 😍",
      sticker: "AFTER",
      backgroundUrl: IMAGES.treatment,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "offer",
      durationInSeconds: 4,
      headline: `Get this look: ${input.offer}`,
      caption: input.offer,
      sticker: "GLOW UP",
      backgroundUrl: IMAGES.hero,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "cta",
      durationInSeconds: 4,
      headline: input.cta,
      caption: "Start your journey",
      subText: input.businessName,
      sticker: "LET'S GO",
      backgroundUrl: IMAGES.client,
      backgroundType: "image",
    },
  ];
};

const createNewServiceReel = (input: ReelInput): ReelScene[] => {
  return [
    {
      id: crypto.randomUUID(),
      type: "hook",
      durationInSeconds: 3,
      headline: `Something NEW is coming to ${input.businessName}`,
      caption: "Big news! 📣",
      sticker: "NEW ARRIVAL",
      backgroundUrl: IMAGES.hero,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "reaction",
      durationInSeconds: 3,
      headline: "Introducing...",
      caption: `We've been working on something special for our ${input.industry} clients`,
      sticker: "SNEAK PEEK",
      backgroundUrl: IMAGES.treatment,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "offer",
      durationInSeconds: 4,
      headline: input.offer,
      caption: `Be the first to experience: ${input.offer}`,
      sticker: "EXCLUSIVE",
      backgroundUrl: IMAGES.room,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "cta",
      durationInSeconds: 4,
      headline: input.cta,
      caption: "Book your spot",
      subText: "Limited slots available",
      sticker: "JOIN US",
      backgroundUrl: IMAGES.hero,
      backgroundType: "image",
    },
  ];
};

const createFestivalReel = (input: ReelInput): ReelScene[] => {
  return [
    {
      id: crypto.randomUUID(),
      type: "hook",
      durationInSeconds: 3,
      headline: "Celebrate with us! ✨",
      caption: "Holiday vibes are here!",
      sticker: "FESTIVE MODE",
      backgroundUrl: IMAGES.hero,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "offer",
      durationInSeconds: 4,
      headline: `Our Holiday Gift: ${input.offer}`,
      caption: `Make this season special with ${input.offer}`,
      sticker: "HOLIDAY DEAL",
      backgroundUrl: IMAGES.treatment,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "proof",
      durationInSeconds: 3,
      headline: "Limited Edition Experience",
      caption: `Only at ${input.businessName}`,
      sticker: "DON'T MISS OUT",
      backgroundUrl: IMAGES.room,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "cta",
      durationInSeconds: 4,
      headline: input.cta,
      caption: "Book for the holidays",
      sticker: "RESERVE NOW",
      backgroundUrl: IMAGES.hero,
      backgroundType: "image",
    },
  ];
};

const createTestimonialReel = (input: ReelInput): ReelScene[] => {
  return [
    {
      id: crypto.randomUUID(),
      type: "hook",
      durationInSeconds: 3,
      headline: "Don't take our word for it...",
      caption: "Real stories from real people",
      sticker: "SOCIAL PROOF",
      backgroundUrl: IMAGES.client,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "proof",
      durationInSeconds: 4,
      headline: `"The best ${input.industry} experience of my life!"`,
      caption: "Sarah was blown away by the results",
      sticker: "⭐⭐⭐⭐⭐",
      backgroundUrl: IMAGES.treatment,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "offer",
      durationInSeconds: 4,
      headline: `Join them! ${input.offer}`,
      caption: input.offer,
      sticker: "YOU'RE NEXT",
      backgroundUrl: IMAGES.room,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "cta",
      durationInSeconds: 4,
      headline: input.cta,
      caption: "See what the hype is about",
      subText: input.businessName,
      sticker: "GO FOR IT",
      backgroundUrl: IMAGES.hero,
      backgroundType: "image",
    },
  ];
};

const createRestaurantMenuReel = (input: ReelInput): ReelScene[] => {
  return [
    {
      id: crypto.randomUUID(),
      type: "hook",
      durationInSeconds: 3,
      headline: `What's cooking at ${input.businessName}?`,
      caption: "Hungry yet? 🤤",
      sticker: "FOODIE FAV",
      backgroundUrl: IMAGES.hero,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "reaction",
      durationInSeconds: 3,
      headline: "Our Signature Dish",
      caption: "Made fresh every single day",
      sticker: "CHEF'S KISS",
      backgroundUrl: IMAGES.treatment,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "offer",
      durationInSeconds: 4,
      headline: input.offer,
      caption: `Try our new ${input.offer}`,
      sticker: "YUM!",
      backgroundUrl: IMAGES.room,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "cta",
      durationInSeconds: 4,
      headline: input.cta,
      caption: "See the full menu",
      sticker: "VIEW MENU",
      backgroundUrl: IMAGES.hero,
      backgroundType: "image",
    },
  ];
};

const createFlashSaleReel = (input: ReelInput): ReelScene[] => {
  return [
    {
      id: crypto.randomUUID(),
      type: "hook",
      durationInSeconds: 3,
      headline: "⏳ STOP SCROLLING ⏳",
      caption: "This won't last long...",
      sticker: "FLASH SALE",
      backgroundUrl: IMAGES.hero,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "offer",
      durationInSeconds: 4,
      headline: input.offer,
      caption: `Hurry! ${input.offer} ending soon`,
      sticker: "URGENT",
      backgroundUrl: IMAGES.treatment,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "proof",
      durationInSeconds: 3,
      headline: "Going fast!",
      caption: "People are already grabbing this",
      sticker: "WHILE SUPPLIES LAST",
      backgroundUrl: IMAGES.room,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "cta",
      durationInSeconds: 4,
      headline: input.cta,
      caption: "Claim yours now",
      sticker: "LAST CHANCE",
      backgroundUrl: IMAGES.hero,
      backgroundType: "image",
    },
  ];
};

const createLocalAwarenessReel = (input: ReelInput): ReelScene[] => {
  return [
    {
      id: crypto.randomUUID(),
      type: "hook",
      durationInSeconds: 3,
      headline: `Hello, neighbors! 👋`,
      caption: `Have you visited ${input.businessName} yet?`,
      sticker: "SHOP LOCAL",
      backgroundUrl: IMAGES.hero,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "problem",
      durationInSeconds: 3,
      headline: `Looking for top-tier ${input.industry}?`,
      caption: "We're right in the heart of the community",
      sticker: "WE'RE OPEN",
      backgroundUrl: IMAGES.room,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "offer",
      durationInSeconds: 4,
      headline: `Special for locals: ${input.offer}`,
      caption: input.offer,
      sticker: "LOCAL PERK",
      backgroundUrl: IMAGES.treatment,
      backgroundType: "image",
    },
    {
      id: crypto.randomUUID(),
      type: "cta",
      durationInSeconds: 4,
      headline: input.cta,
      caption: "Come say hi!",
      subText: input.businessName,
      sticker: "VISIT US",
      backgroundUrl: IMAGES.hero,
      backgroundType: "image",
    },
  ];
};

export const createReelFromInput = (input: ReelInput): ReelData => {
  let scenes: ReelScene[] = [];

  switch (input.preset) {
    case "offer":
      scenes = createOfferReel(input);
      break;
    case "before_after":
      scenes = createBeforeAfterReel(input);
      break;
    case "new_service":
      scenes = createNewServiceReel(input);
      break;
    case "festival":
      scenes = createFestivalReel(input);
      break;
    case "testimonial":
      scenes = createTestimonialReel(input);
      break;
    case "restaurant_menu":
      scenes = createRestaurantMenuReel(input);
      break;
    case "flash_sale":
      scenes = createFlashSaleReel(input);
      break;
    case "local_awareness":
      scenes = createLocalAwarenessReel(input);
      break;
    default:
      scenes = createOfferReel(input);
  }

  return {
    businessName: input.businessName,
    brandColor: input.brandColor,
    accentColor: input.accentColor,
    scenes,
  };
};
