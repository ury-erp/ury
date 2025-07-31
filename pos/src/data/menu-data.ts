// Sample menu data
export const menuData = [
  // Breakfast Items
  {
    id: 'b1',
    name: 'Plain Dosa',
    price: 45,
    category: 'Breakfast',
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=500',
    description: 'Crispy South Indian crepe served with coconut chutney and sambar',
    popular: true,
    variants: [
      { id: 'b1-1', name: 'Single', price: 45 },
      { id: 'b1-2', name: 'Double', price: 80 }
    ],
    addons: [
      { id: '1', name: 'Extra Chutney', price: 10, category: 'sides' as const },
      { id: '2', name: 'Extra Sambar', price: 15, category: 'sides' as const },
      { id: '3', name: 'Filter Coffee', price: 25, category: 'drinks' as const }
    ]
  },
  {
    id: 'b2',
    name: 'Masala Dosa',
    price: 65,
    category: 'Breakfast',
    image: 'https://images.unsplash.com/photo-1630383249896-424e482df921?w=500',
    description: 'Crispy dosa filled with spiced potato masala',
    trending: true,
    variants: [
      { id: 'b2-1', name: 'Regular', price: 65 },
      { id: 'b2-2', name: 'Rava Masala', price: 75 }
    ],
    addons: [
      { id: '1', name: 'Extra Chutney', price: 10, category: 'sides' as const },
      { id: '2', name: 'Extra Sambar', price: 15, category: 'sides' as const }
    ]
  },
  {
    id: 'b3',
    name: 'Idli (2 pcs)',
    price: 35,
    category: 'Breakfast',
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=500',
    description: 'Soft steamed rice cakes served with chutney and sambar',
    recommended: true,
    variants: [
      { id: 'b3-1', name: '2 pieces', price: 35 },
      { id: 'b3-2', name: '4 pieces', price: 60 }
    ],
    addons: [
      { id: '1', name: 'Extra Chutney', price: 10, category: 'sides' as const },
      { id: '2', name: 'Extra Sambar', price: 15, category: 'sides' as const }
    ]
  },

  // Lunch Items
  {
    id: 'l1',
    name: 'Chicken Biryani',
    price: 180,
    category: 'Lunch',
    image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=500',
    description: 'Aromatic basmati rice cooked with tender chicken and spices',
    popular: true,
    variants: [
      { id: 'l1-1', name: 'Half', price: 180 },
      { id: 'l1-2', name: 'Full', price: 320 }
    ],
    addons: [
      { id: '5', name: 'Raita', price: 25, category: 'sides' as const },
      { id: '6', name: 'Pickle', price: 15, category: 'sides' as const },
      { id: '7', name: 'Boiled Egg', price: 20, category: 'sides' as const }
    ]
  },
  {
    id: 'l2',
    name: 'Mutton Biryani',
    price: 220,
    category: 'Lunch',
    image: 'https://images.unsplash.com/photo-1642821373181-696a54913e93?w=500',
    description: 'Premium basmati rice with tender mutton pieces and aromatic spices',
    trending: true,
    variants: [
      { id: 'l2-1', name: 'Half', price: 220 },
      { id: 'l2-2', name: 'Full', price: 380 }
    ],
    addons: [
      { id: '5', name: 'Raita', price: 25, category: 'sides' as const },
      { id: '6', name: 'Pickle', price: 15, category: 'sides' as const },
      { id: '7', name: 'Boiled Egg', price: 20, category: 'sides' as const }
    ]
  },

  // Burgers
  {
    id: 'br1',
    name: 'Chicken Burger',
    price: 120,
    category: 'Burgers',
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500',
    description: 'Juicy chicken patty with fresh vegetables and special sauce',
    popular: true,
    variants: [
      { id: 'br1-1', name: 'Regular', price: 120 },
      { id: 'br1-2', name: 'Combo with Fries', price: 180 }
    ],
    addons: [
      { id: '8', name: 'Extra Cheese', price: 20, category: 'sides' as const },
      { id: '9', name: 'Bacon', price: 30, category: 'sides' as const }
    ]
  },
  {
    id: 'br2',
    name: 'Veg Burger',
    price: 100,
    category: 'Burgers',
    image: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=500',
    description: 'Fresh vegetable patty with lettuce, tomato, and cheese',
    recommended: true,
    variants: [
      { id: 'br2-1', name: 'Regular', price: 100 },
      { id: 'br2-2', name: 'Combo with Fries', price: 150 }
    ],
    addons: [
      { id: '8', name: 'Extra Cheese', price: 20, category: 'sides' as const },
      { id: '10', name: 'Extra Patty', price: 40, category: 'sides' as const }
    ]
  },

  // Pizza
  {
    id: 'p1',
    name: 'Margherita Pizza',
    price: 200,
    category: 'Pizza',
    image: 'https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=500',
    description: 'Classic pizza with tomato sauce, mozzarella, and basil',
    trending: true,
    variants: [
      { id: 'p1-1', name: 'Small (8")', price: 200 },
      { id: 'p1-2', name: 'Medium (12")', price: 300 },
      { id: 'p1-3', name: 'Large (14")', price: 400 }
    ],
    addons: [
      { id: '11', name: 'Extra Cheese', price: 50, category: 'sides' as const },
      { id: '12', name: 'Mushrooms', price: 40, category: 'sides' as const }
    ]
  },

  // Salads
  {
    id: 's1',
    name: 'Caesar Salad',
    price: 80,
    category: 'Salads',
    image: 'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=500',
    description: 'Fresh romaine lettuce with Caesar dressing and croutons',
    recommended: true,
    variants: [
      { id: 's1-1', name: 'Regular', price: 80 },
      { id: 's1-2', name: 'With Chicken', price: 120 }
    ],
    addons: [
      { id: '13', name: 'Extra Dressing', price: 15, category: 'sides' as const },
      { id: '14', name: 'Parmesan Cheese', price: 20, category: 'sides' as const }
    ]
  },

  // Sides
  {
    id: 'sd1',
    name: 'French Fries',
    price: 60,
    category: 'Sides',
    image: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=500',
    description: 'Crispy golden fries served with ketchup',
    popular: true,
    variants: [
      { id: 'sd1-1', name: 'Regular', price: 60 },
      { id: 'sd1-2', name: 'Large', price: 90 }
    ],
    addons: [
      { id: '15', name: 'Cheese Sauce', price: 20, category: 'sides' as const },
      { id: '16', name: 'Chilli Mayo', price: 15, category: 'sides' as const }
    ]
  }
]; 